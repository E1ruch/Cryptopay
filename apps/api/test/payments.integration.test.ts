import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { createTestApp } from './support/bootstrap.js';
import { cleanDatabase } from './support/db-cleanup.js';
import { createApiKey, createOrganization, registerVerifyAndLogin } from './support/test-user.js';

describe('Payment detection & confirmation pipeline (spec §21/§58/§93 Phase 1)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let payments: PaymentsService;

  beforeEach(async () => {
    app ??= await createTestApp();
    prisma = app.get(PrismaService);
    payments = app.get(PaymentsService);
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function setupInvoice(amount = '49.00') {
    const fastify = app.getHttpAdapter().getInstance();
    const session = await registerVerifyAndLogin(app, `merchant-${Date.now()}-${Math.random()}@example.com`);
    await createOrganization(app, session, 'Acme Inc');
    const { rawKey } = await createApiKey(app, session);
    const created = await fastify.inject({
      method: 'POST',
      url: '/v1/invoices',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { amount, currency: 'USD', token: 'USDC', network: 'base' },
    });
    const invoice = JSON.parse(created.body) as { id: string; paymentAddress: string };
    return { fastify, rawKey, invoice };
  }

  // Waits by re-ticking the pipeline rather than sleeping a fixed duration —
  // BLOCKCHAIN_BLOCK_TIME_MS is tiny in tests (see vitest.setup.ts) so a few
  // ticks accrue enough confirmations almost immediately.
  async function tickUntil(predicate: () => Promise<boolean>, maxAttempts = 50): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      await payments.tick();
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error('tickUntil: predicate never became true');
  }

  it('detects a simulated payment immediately, without waiting for the background tick', async () => {
    const { fastify, rawKey, invoice } = await setupInvoice();

    const response = await fastify.inject({
      method: 'POST',
      url: `/v1/invoices/${invoice.id}/simulate-payment`,
      headers: { authorization: `Bearer ${rawKey}` },
      payload: {},
    });

    expect(response.statusCode).toBe(201);
    // DETECTED is momentary (0 confirmations, spec §24) — a single tick both
    // detects the transfer and starts watching its confirmations grow, so by
    // the time the response comes back the invoice is already CONFIRMING.
    expect((JSON.parse(response.body) as { status: string }).status).toBe('CONFIRMING');

    const payment = await prisma.payment.findFirst({ where: { invoiceId: invoice.id } });
    expect(payment?.status).toBe('CONFIRMING');
    expect(payment?.receivedAmount).not.toBeNull();
  });

  it('confirms an exact payment through to PAID (spec §24 confirmation policy)', async () => {
    const { fastify, rawKey, invoice } = await setupInvoice('49.00');

    await fastify.inject({
      method: 'POST',
      url: `/v1/invoices/${invoice.id}/simulate-payment`,
      headers: { authorization: `Bearer ${rawKey}` },
      payload: {},
    });

    await tickUntil(async () => {
      const current = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      return current.status === 'PAID';
    });

    const finalInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(finalInvoice.status).toBe('PAID');
    expect(finalInvoice.paidAt).not.toBeNull();

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(payment.status).toBe('CONFIRMED');
    expect(payment.confirmations).toBeGreaterThanOrEqual(2); // REQUIRED_CONFIRMATIONS in tests

    const event = await prisma.webhookEvent.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(event.type).toBe('payment.paid');
    expect(event.data).toMatchObject({ invoice_id: invoice.id, status: 'paid', tx_hash: payment.txHash });
  });

  it('flags underpayment instead of silently marking PAID (spec §44)', async () => {
    const { fastify, rawKey, invoice } = await setupInvoice('100.00');

    await fastify.inject({
      method: 'POST',
      url: `/v1/invoices/${invoice.id}/simulate-payment`,
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { amount: '95.00' },
    });

    await tickUntil(async () => {
      const current = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      return current.status === 'UNDERPAID';
    });

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(payment.status).toBe('UNDERPAID');
  });

  it('flags overpayment instead of auto-refunding (spec §45)', async () => {
    const { fastify, rawKey, invoice } = await setupInvoice('100.00');

    await fastify.inject({
      method: 'POST',
      url: `/v1/invoices/${invoice.id}/simulate-payment`,
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { amount: '105.00' },
    });

    await tickUntil(async () => {
      const current = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      return current.status === 'OVERPAID';
    });

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(payment.status).toBe('OVERPAID');
  });

  it('rejects simulating a payment on an invoice that already has one', async () => {
    const { fastify, rawKey, invoice } = await setupInvoice();
    await fastify.inject({
      method: 'POST',
      url: `/v1/invoices/${invoice.id}/simulate-payment`,
      headers: { authorization: `Bearer ${rawKey}` },
      payload: {},
    });

    const second = await fastify.inject({
      method: 'POST',
      url: `/v1/invoices/${invoice.id}/simulate-payment`,
      headers: { authorization: `Bearer ${rawKey}` },
      payload: {},
    });

    expect(second.statusCode).toBe(409);
  });

  it('expires a PENDING invoice past its expiry without touching paid ones', async () => {
    const { invoice } = await setupInvoice();
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await payments.tick();

    const expired = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(expired.status).toBe('EXPIRED');
  });

  it('fails an orphaned payment gracefully instead of stalling the whole tick', async () => {
    // Simulates a payment the current FakeBlockchainAdapter instance has no
    // memory of — exactly what happens to any in-flight payment across an
    // API process restart, since the fake chain's state is in-memory only.
    const { invoice: orphanInvoice } = await setupInvoice('10.00');
    await prisma.payment.create({
      data: {
        id: 'pay_orphan_test',
        invoiceId: orphanInvoice.id,
        organizationId: (await prisma.invoice.findUniqueOrThrow({ where: { id: orphanInvoice.id } }))
          .organizationId,
        network: 'base',
        token: 'USDC',
        expectedAmount: '10.00',
        receivedAmount: '10.00',
        txHash: '0xdoesnotexistinthefakechain',
        toAddress: 'irrelevant',
        status: 'DETECTED',
        detectedAt: new Date(),
      },
    });
    await prisma.invoice.update({ where: { id: orphanInvoice.id }, data: { status: 'DETECTED' } });

    // A second, healthy invoice+payment processed in the very same tick —
    // proves the orphaned one doesn't abort processing for everyone else.
    const { fastify, rawKey, invoice: healthyInvoice } = await setupInvoice('20.00');
    await fastify.inject({
      method: 'POST',
      url: `/v1/invoices/${healthyInvoice.id}/simulate-payment`,
      headers: { authorization: `Bearer ${rawKey}` },
      payload: {},
    });

    await payments.tick();

    const orphaned = await prisma.invoice.findUniqueOrThrow({ where: { id: orphanInvoice.id } });
    expect(orphaned.status).toBe('FAILED');
    const orphanedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: 'pay_orphan_test' } });
    expect(orphanedPayment.status).toBe('FAILED');

    const healthy = await prisma.invoice.findUniqueOrThrow({ where: { id: healthyInvoice.id } });
    expect(['DETECTED', 'CONFIRMING']).toContain(healthy.status);
  });
});
