import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { createTestApp } from './support/bootstrap.js';
import { cleanDatabase } from './support/db-cleanup.js';
import { createApiKey, createOrganization, registerVerifyAndLogin, type RegisteredSession } from './support/test-user.js';

describe('Merchant dashboard API (spec §63)', () => {
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

  async function setupMerchant() {
    const fastify = app.getHttpAdapter().getInstance();
    const session = await registerVerifyAndLogin(app, `merchant-${Date.now()}-${Math.random()}@example.com`);
    await createOrganization(app, session, 'Acme Inc');
    return { fastify, session };
  }

  async function authedRequest(
    session: RegisteredSession,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) {
    const fastify = app.getHttpAdapter().getInstance();
    return fastify.inject({
      method,
      url,
      headers: { cookie: session.cookieHeader, 'x-csrf-token': session.csrfToken },
      ...(payload !== undefined ? { payload } : {}),
    });
  }

  describe('invoices', () => {
    it('lists invoices created via the merchant API, paginated newest-first', async () => {
      const { fastify, session } = await setupMerchant();
      const { rawKey } = await createApiKey(app, session);

      for (const amount of ['10.00', '20.00', '30.00']) {
        await fastify.inject({
          method: 'POST',
          url: '/v1/invoices',
          headers: { authorization: `Bearer ${rawKey}` },
          payload: { amount, currency: 'USD', token: 'USDC', network: 'base' },
        });
      }

      const response = await authedRequest(session, 'GET', '/v1/dashboard/invoices');
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: { amount: string }[]; total: number };
      expect(body.total).toBe(3);
      expect(body.data.map((i) => i.amount)).toEqual(['30', '20', '10']); // newest first
    });

    it('fetches a single invoice by id', async () => {
      const { fastify, session } = await setupMerchant();
      const { rawKey } = await createApiKey(app, session);
      const created = await fastify.inject({
        method: 'POST',
        url: '/v1/invoices',
        headers: { authorization: `Bearer ${rawKey}` },
        payload: { amount: '49.00', currency: 'USD', token: 'USDC', network: 'base' },
      });
      const { id } = JSON.parse(created.body) as { id: string };

      const response = await authedRequest(session, 'GET', `/v1/dashboard/invoices/${id}`);
      expect(response.statusCode).toBe(200);
      expect((JSON.parse(response.body) as { id: string }).id).toBe(id);
    });

    it('never leaks another organization\'s invoices (spec §12 BOLA)', async () => {
      const { fastify, session: sessionA } = await setupMerchant();
      const { rawKey } = await createApiKey(app, sessionA);
      const created = await fastify.inject({
        method: 'POST',
        url: '/v1/invoices',
        headers: { authorization: `Bearer ${rawKey}` },
        payload: { amount: '49.00', currency: 'USD', token: 'USDC', network: 'base' },
      });
      const { id } = JSON.parse(created.body) as { id: string };

      const { session: sessionB } = await setupMerchant();
      const response = await authedRequest(sessionB, 'GET', `/v1/dashboard/invoices/${id}`);
      expect(response.statusCode).toBe(404);
    });

    it('rejects an unauthenticated request', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const response = await fastify.inject({ method: 'GET', url: '/v1/dashboard/invoices' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('webhook endpoints', () => {
    it('creates, lists, and revokes an endpoint via the dashboard session', async () => {
      const { session } = await setupMerchant();

      const created = await authedRequest(session, 'POST', '/v1/dashboard/webhook-endpoints', {
        url: 'https://example.com/webhook',
      });
      expect(created.statusCode).toBe(201);
      const body = JSON.parse(created.body) as { id: string; secret: string };
      expect(body.secret).toMatch(/^whsec_/);

      const listed = await authedRequest(session, 'GET', '/v1/dashboard/webhook-endpoints');
      expect((JSON.parse(listed.body) as unknown[]).length).toBe(1);

      const revoked = await authedRequest(session, 'DELETE', `/v1/dashboard/webhook-endpoints/${body.id}`);
      expect(revoked.statusCode).toBe(204);

      const endpoint = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: body.id } });
      expect(endpoint.enabled).toBe(false);
    });

    it('rejects creation without a valid CSRF token', async () => {
      const { session } = await setupMerchant();
      const fastify = app.getHttpAdapter().getInstance();

      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/dashboard/webhook-endpoints',
        headers: { cookie: session.cookieHeader }, // no x-csrf-token
        payload: { url: 'https://example.com/webhook' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('rejects a non-HTTPS webhook URL', async () => {
      const { session } = await setupMerchant();
      const response = await authedRequest(session, 'POST', '/v1/dashboard/webhook-endpoints', {
        url: 'http://example.com/webhook',
      });
      expect(response.statusCode).toBe(400);
    });

    it('lists delivery attempts for an endpoint (spec §28)', async () => {
      const { fastify, session } = await setupMerchant();
      const created = await authedRequest(session, 'POST', '/v1/dashboard/webhook-endpoints', {
        url: 'https://example.com/webhook',
      });
      const { id: endpointId } = JSON.parse(created.body) as { id: string };

      const { rawKey } = await createApiKey(app, session);
      const invoiceResponse = await fastify.inject({
        method: 'POST',
        url: '/v1/invoices',
        headers: { authorization: `Bearer ${rawKey}` },
        payload: { amount: '10.00', currency: 'USD', token: 'USDC', network: 'base' },
      });
      const { id: invoiceId } = JSON.parse(invoiceResponse.body) as { id: string };

      const event = await prisma.webhookEvent.create({
        data: {
          id: 'evt_dashboard_test',
          organizationId: (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).organizationId,
          invoiceId,
          type: 'payment.paid',
          data: { invoice_id: invoiceId },
        },
      });
      await prisma.webhookDelivery.create({
        data: {
          id: 'whd_dashboard_test',
          eventId: event.id,
          endpointId,
          status: 'SUCCEEDED',
          statusCode: 200,
          deliveredAt: new Date(),
        },
      });

      const response = await authedRequest(session, 'GET', `/v1/dashboard/webhook-endpoints/${endpointId}/deliveries`);
      expect(response.statusCode).toBe(200);
      const deliveries = JSON.parse(response.body) as { eventType: string; status: string }[];
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({ eventType: 'payment.paid', status: 'SUCCEEDED' });
    });
  });
});
