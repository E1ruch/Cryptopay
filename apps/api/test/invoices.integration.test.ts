import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { createTestApp } from './support/bootstrap.js';
import { cleanDatabase } from './support/db-cleanup.js';
import { createApiKey, createOrganization, registerVerifyAndLogin } from './support/test-user.js';

describe('Invoices API (spec §51)', () => {
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

  async function setupMerchant(scopes = ['invoices:read', 'invoices:write']) {
    const fastify = app.getHttpAdapter().getInstance();
    const session = await registerVerifyAndLogin(app, `merchant-${Date.now()}-${Math.random()}@example.com`);
    await createOrganization(app, session, 'Acme Inc');
    const { rawKey } = await createApiKey(app, session, scopes);
    return { fastify, rawKey };
  }

  it('creates an invoice and returns a checkout URL (spec §51)', async () => {
    const { fastify, rawKey } = await setupMerchant();

    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/invoices',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: {
        amount: '49.00',
        currency: 'USD',
        token: 'USDC',
        network: 'base',
        externalId: 'order_12345',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: 'PENDING',
      // Decimal.toString() drops insignificant trailing zeros — "49.00" in,
      // "49" out, numerically identical (spec §18 cares about exactness,
      // not display formatting, which is a client concern).
      amount: '49',
      currency: 'USD',
      token: 'USDC',
      network: 'base',
      externalId: 'order_12345',
    });
    expect(body.id).toMatch(/^inv_/);
    expect(body.paymentAddress).toMatch(/^0x[0-9a-f]{40}$/);
    expect(body.checkoutUrl).toBe(`http://localhost:3000/pay/${body.id as string}`);
  });

  it('rejects a float-unsafe or malformed amount', async () => {
    const { fastify, rawKey } = await setupMerchant();

    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/invoices',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { amount: 'not-a-number', currency: 'USD', token: 'USDC', network: 'base' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('replays the same invoice on a retried external_id with matching params (spec §26/§52)', async () => {
    const { fastify, rawKey } = await setupMerchant();
    const payload = { amount: '49.00', currency: 'USD', token: 'USDC', network: 'base', externalId: 'order_1' };

    const first = await fastify.inject({
      method: 'POST',
      url: '/v1/invoices',
      headers: { authorization: `Bearer ${rawKey}` },
      payload,
    });
    const second = await fastify.inject({
      method: 'POST',
      url: '/v1/invoices',
      headers: { authorization: `Bearer ${rawKey}` },
      payload,
    });

    expect(second.statusCode).toBe(201);
    const firstBody = JSON.parse(first.body) as { id: string };
    const secondBody = JSON.parse(second.body) as { id: string };
    expect(secondBody.id).toBe(firstBody.id);
  });

  it('rejects reusing external_id with different parameters', async () => {
    const { fastify, rawKey } = await setupMerchant();
    await fastify.inject({
      method: 'POST',
      url: '/v1/invoices',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { amount: '49.00', currency: 'USD', token: 'USDC', network: 'base', externalId: 'order_1' },
    });

    const conflicting = await fastify.inject({
      method: 'POST',
      url: '/v1/invoices',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { amount: '99.00', currency: 'USD', token: 'USDC', network: 'base', externalId: 'order_1' },
    });

    expect(conflicting.statusCode).toBe(409);
  });

  it('fetches an invoice by id, scoped to the owning organization', async () => {
    const { fastify, rawKey } = await setupMerchant();
    const created = await fastify.inject({
      method: 'POST',
      url: '/v1/invoices',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { amount: '10.00', currency: 'USD', token: 'USDC', network: 'base' },
    });
    const { id } = JSON.parse(created.body) as { id: string };

    const response = await fastify.inject({
      method: 'GET',
      url: `/v1/invoices/${id}`,
      headers: { authorization: `Bearer ${rawKey}` },
    });

    expect(response.statusCode).toBe(200);
    expect((JSON.parse(response.body) as { id: string }).id).toBe(id);
  });

  it('never leaks an invoice across organizations (spec §12 BOLA)', async () => {
    const { fastify, rawKey: keyA } = await setupMerchant();
    const created = await fastify.inject({
      method: 'POST',
      url: '/v1/invoices',
      headers: { authorization: `Bearer ${keyA}` },
      payload: { amount: '10.00', currency: 'USD', token: 'USDC', network: 'base' },
    });
    const { id } = JSON.parse(created.body) as { id: string };

    const { rawKey: keyB } = await setupMerchant();
    const response = await fastify.inject({
      method: 'GET',
      url: `/v1/invoices/${id}`,
      headers: { authorization: `Bearer ${keyB}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects an API key missing the invoices:write scope (spec §75)', async () => {
    const { fastify, rawKey } = await setupMerchant(['invoices:read']);

    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/invoices',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { amount: '10.00', currency: 'USD', token: 'USDC', network: 'base' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects requests without a valid API key', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const response = await fastify.inject({ method: 'GET', url: '/v1/invoices/inv_doesnotexist' });
    expect(response.statusCode).toBe(401);
  });
});
