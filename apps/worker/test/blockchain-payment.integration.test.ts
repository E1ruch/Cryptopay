import type { BlockchainAdapter, TokenTransfer } from '@cryptopay/blockchain';
import { FakeBlockchainAdapter } from '@cryptopay/blockchain';
import { loadEnv } from '@cryptopay/config';
import { Prisma, createPrismaClient, type PrismaClient } from '@cryptopay/database';
import { createLogger, type Logger } from '@cryptopay/logger';
import { NotFoundError, generateId } from '@cryptopay/shared';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBlockchainScan } from '../src/queues/blockchain-scan.queue.js';
import { runPaymentConfirm } from '../src/queues/payment-confirm.queue.js';

const env = loadEnv();
const prisma: PrismaClient = createPrismaClient({ databaseUrl: env.DATABASE_URL });
const logger: Logger = createLogger({ name: 'test', level: 'silent' });
const ADDRESS = '0x1111111111111111111111111111111111111a';

async function cleanDatabase(): Promise<void> {
  await prisma.webhookEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.blockchainScanCursor.deleteMany();
}

async function createOrg() {
  return prisma.organization.create({
    data: { name: 'Acme', slug: `acme-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
}

async function createInvoice(organizationId: string, amount: string, createdAt?: Date) {
  return prisma.invoice.create({
    data: {
      id: generateId('inv'),
      organizationId,
      status: 'PENDING',
      amount,
      currency: 'USD',
      token: 'USDC',
      network: 'base',
      paymentAddress: ADDRESS,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

describe('blockchain scan queue (spec §21)', () => {
  beforeEach(cleanDatabase);
  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('detects a matching transfer and creates a DETECTED payment', async () => {
    const org = await createOrg();
    const invoice = await createInvoice(org.id, '49.00');

    const adapter = new FakeBlockchainAdapter({ blockTimeMs: 1 });
    adapter.simulatePayment({
      network: 'base',
      token: 'USDC',
      toAddress: ADDRESS,
      amount: new Prisma.Decimal('49.00'),
    });

    await runBlockchainScan(prisma, adapter, 'base', logger);

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(payment.status).toBe('DETECTED');
    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.status).toBe('DETECTED');
  });

  it('persists the scan cursor so a second pass does not re-detect the same transfer', async () => {
    const org = await createOrg();
    await createInvoice(org.id, '10.00');

    const adapter = new FakeBlockchainAdapter({ blockTimeMs: 1 });
    adapter.simulatePayment({ network: 'base', token: 'USDC', toAddress: ADDRESS, amount: new Prisma.Decimal('10.00') });

    await runBlockchainScan(prisma, adapter, 'base', logger);
    await runBlockchainScan(prisma, adapter, 'base', logger);

    const payments = await prisma.payment.findMany();
    expect(payments).toHaveLength(1);
    const cursor = await prisma.blockchainScanCursor.findUniqueOrThrow({ where: { network: 'base' } });
    expect(Number(cursor.lastScannedBlock)).toBeGreaterThanOrEqual(0);
  });

  it('picks the invoice with an exact amount match when the address is shared (spec §42 reuse)', async () => {
    const org = await createOrg();
    const older = await createInvoice(org.id, '10.00', new Date(Date.now() - 60_000));
    const exact = await createInvoice(org.id, '25.00', new Date());

    const adapter = new FakeBlockchainAdapter({ blockTimeMs: 1 });
    adapter.simulatePayment({ network: 'base', token: 'USDC', toAddress: ADDRESS, amount: new Prisma.Decimal('25.00') });

    await runBlockchainScan(prisma, adapter, 'base', logger);

    const payment = await prisma.payment.findFirstOrThrow();
    expect(payment.invoiceId).toBe(exact.id);
    expect(payment.invoiceId).not.toBe(older.id);
  });
});

/** Minimal hand-rolled adapter for confirm/reorg tests — full control over getConfirmations without real timers. */
function makeConfirmStub(overrides: Partial<BlockchainAdapter> = {}): BlockchainAdapter {
  return {
    validateAddress: () => true,
    getLatestBlock: async () => 100,
    getTransaction: async () => null,
    getTokenTransfers: async (): Promise<TokenTransfer[]> => [],
    getConfirmations: async () => 0,
    ...overrides,
  };
}

async function createDetectedPayment(invoiceId: string, organizationId: string, txHash: string) {
  return prisma.payment.create({
    data: {
      id: generateId('pay'),
      invoiceId,
      organizationId,
      network: 'base',
      token: 'USDC',
      expectedAmount: '49.00',
      receivedAmount: '49.00',
      txHash,
      toAddress: ADDRESS,
      status: 'DETECTED',
      detectedAt: new Date(),
    },
  });
}

describe('payment confirm queue (spec §21/§24/§25)', () => {
  beforeEach(cleanDatabase);
  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('moves DETECTED to CONFIRMING once a transaction has at least one confirmation', async () => {
    const org = await createOrg();
    const invoice = await createInvoice(org.id, '49.00');
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'DETECTED' } });
    const payment = await createDetectedPayment(invoice.id, org.id, '0xabc');

    const adapter = makeConfirmStub({ getConfirmations: async () => 1 });
    await runPaymentConfirm(prisma, adapter, 3, logger);

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe('CONFIRMING');
  });

  it('finalizes to CONFIRMED/PAID and writes a payment.paid webhook event once required confirmations are met', async () => {
    const org = await createOrg();
    const invoice = await createInvoice(org.id, '49.00');
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'CONFIRMING' } });
    const payment = await createDetectedPayment(invoice.id, org.id, '0xdef');
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMING' } });

    const adapter = makeConfirmStub({ getConfirmations: async () => 3 });
    await runPaymentConfirm(prisma, adapter, 3, logger);

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe('CONFIRMED');
    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updatedInvoice.status).toBe('PAID');
    const event = await prisma.webhookEvent.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(event.type).toBe('payment.paid');
  });

  it('marks a CONFIRMING payment REORG_DETECTED when its transaction disappears (spec §25)', async () => {
    const org = await createOrg();
    const invoice = await createInvoice(org.id, '49.00');
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'CONFIRMING' } });
    const payment = await createDetectedPayment(invoice.id, org.id, '0xreorg');
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMING' } });

    const adapter = makeConfirmStub({
      getConfirmations: vi.fn().mockRejectedValue(new NotFoundError('gone')),
    });
    await runPaymentConfirm(prisma, adapter, 3, logger);

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe('REORG_DETECTED');
    // Invoice stays CONFIRMING while the payment is re-evaluated — spec §25
    // scopes reorg re-evaluation to the payment attempt, not the invoice.
    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updatedInvoice.status).toBe('CONFIRMING');
  });

  it('resumes confirming a REORG_DETECTED payment once its transaction reappears', async () => {
    const org = await createOrg();
    const invoice = await createInvoice(org.id, '49.00');
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'CONFIRMING' } });
    const payment = await createDetectedPayment(invoice.id, org.id, '0xback');
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REORG_DETECTED' } });

    const adapter = makeConfirmStub({ getConfirmations: async () => 2 });
    await runPaymentConfirm(prisma, adapter, 3, logger);

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe('CONFIRMING');
    expect(updated.confirmations).toBe(2);
  });

  it('fails a REORG_DETECTED payment once the grace window has elapsed without the transaction reappearing', async () => {
    const org = await createOrg();
    const invoice = await createInvoice(org.id, '49.00');
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'CONFIRMING' } });
    const payment = await createDetectedPayment(invoice.id, org.id, '0xgone');
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REORG_DETECTED' } });
    // Simulate the transition having happened 11 minutes ago (grace window is 10).
    await prisma.$executeRaw`UPDATE payments SET updated_at = ${new Date(Date.now() - 11 * 60_000)} WHERE id = ${payment.id}`;

    const adapter = makeConfirmStub({
      getConfirmations: vi.fn().mockRejectedValue(new NotFoundError('still gone')),
    });
    await runPaymentConfirm(prisma, adapter, 3, logger);

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe('FAILED');
    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updatedInvoice.status).toBe('FAILED');
  });

  it('expires an overdue PENDING invoice and writes an invoice.expired webhook event', async () => {
    const org = await createOrg();
    const invoice = await prisma.invoice.create({
      data: {
        id: generateId('inv'),
        organizationId: org.id,
        status: 'PENDING',
        amount: '49.00',
        currency: 'USD',
        token: 'USDC',
        network: 'base',
        paymentAddress: ADDRESS,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await runPaymentConfirm(prisma, makeConfirmStub(), 3, logger);

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.status).toBe('EXPIRED');
    const event = await prisma.webhookEvent.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(event.type).toBe('invoice.expired');
  });
});
