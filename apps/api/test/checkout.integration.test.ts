import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { createTestApp } from './support/bootstrap.js';
import { cleanDatabase } from './support/db-cleanup.js';
import { createApiKey, createOrganization, registerVerifyAndLogin } from './support/test-user.js';

describe('Public checkout API (spec §19/§48)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    app ??= await createTestApp();
    prisma = app.get(PrismaService);
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
      payload: { amount, currency: 'USD', token: 'USDC', network: 'base', externalId: 'order_1' },
    });
    return { fastify, invoice: JSON.parse(created.body) as { id: string } };
  }

  it('returns the public-safe checkout view without authentication', async () => {
    const { fastify, invoice } = await setupInvoice();

    const response = await fastify.inject({ method: 'GET', url: `/v1/checkout/${invoice.id}` });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: invoice.id,
      status: 'PENDING',
      merchantName: 'Acme Inc',
      amount: '49',
      currency: 'USD',
      token: 'USDC',
      network: 'base',
    });
    expect(body.paymentAddress).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it('never leaks internal identifiers or merchant-private data (spec §48)', async () => {
    const { fastify, invoice } = await setupInvoice();

    const response = await fastify.inject({ method: 'GET', url: `/v1/checkout/${invoice.id}` });
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(body).not.toHaveProperty('organizationId');
    expect(body).not.toHaveProperty('externalId');
    expect(body).not.toHaveProperty('metadata');
  });

  it('returns 404 for a nonexistent invoice', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const response = await fastify.inject({ method: 'GET', url: '/v1/checkout/inv_doesnotexist' });
    expect(response.statusCode).toBe(404);
  });

  it('lets an anonymous customer simulate payment, no API key required (spec §58)', async () => {
    const { fastify, invoice } = await setupInvoice('49.00');

    const response = await fastify.inject({
      method: 'POST',
      url: `/v1/checkout/${invoice.id}/simulate-payment`,
      payload: {},
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.status).toBe('CONFIRMING'); // detect + first confirm tick happen synchronously
  });

  it('supports an underpaid amount override from the checkout page', async () => {
    const { fastify, invoice } = await setupInvoice('100.00');

    await fastify.inject({
      method: 'POST',
      url: `/v1/checkout/${invoice.id}/simulate-payment`,
      payload: { amount: '95.00' },
    });

    const view = await fastify.inject({ method: 'GET', url: `/v1/checkout/${invoice.id}` });
    const body = JSON.parse(view.body) as { status: string };
    expect(['CONFIRMING', 'UNDERPAID']).toContain(body.status);
  });

  it('rejects simulating a second payment on the same invoice', async () => {
    const { fastify, invoice } = await setupInvoice();
    await fastify.inject({ method: 'POST', url: `/v1/checkout/${invoice.id}/simulate-payment`, payload: {} });

    const second = await fastify.inject({
      method: 'POST',
      url: `/v1/checkout/${invoice.id}/simulate-payment`,
      payload: {},
    });

    expect(second.statusCode).toBe(409);
  });
});
