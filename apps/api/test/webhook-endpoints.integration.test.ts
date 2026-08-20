import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { createTestApp } from './support/bootstrap.js';
import { cleanDatabase } from './support/db-cleanup.js';
import { createApiKey, createOrganization, registerVerifyAndLogin } from './support/test-user.js';

describe('Webhook endpoints API (spec §27/§29)', () => {
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

  async function setupMerchant(scopes = ['webhooks:read', 'webhooks:write']) {
    const fastify = app.getHttpAdapter().getInstance();
    const session = await registerVerifyAndLogin(app, `merchant-${Date.now()}-${Math.random()}@example.com`);
    await createOrganization(app, session, 'Acme Inc');
    const { rawKey } = await createApiKey(app, session, scopes);
    return { fastify, rawKey };
  }

  it('registers a webhook endpoint and returns the signing secret exactly once', async () => {
    const { fastify, rawKey } = await setupMerchant();

    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/webhook-endpoints',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { url: 'https://example.com/webhook' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as { id: string; url: string; secret: string; enabled: boolean };
    expect(body.id).toMatch(/^we_/);
    expect(body.url).toBe('https://example.com/webhook');
    expect(body.secret).toMatch(/^whsec_/);
    expect(body.enabled).toBe(true);

    const stored = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: body.id } });
    expect(stored.secretEnc).not.toContain(body.secret); // never stored in plaintext
  });

  it('rejects a non-HTTPS webhook URL (spec §29)', async () => {
    const { fastify, rawKey } = await setupMerchant();

    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/webhook-endpoints',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { url: 'http://example.com/webhook' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a webhook URL pointing at a private/internal address (SSRF, spec §29)', async () => {
    const { fastify, rawKey } = await setupMerchant();

    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/webhook-endpoints',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { url: 'https://127.0.0.1/webhook' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('lists and revokes endpoints, scoped to the owning organization', async () => {
    const { fastify, rawKey } = await setupMerchant();
    const created = await fastify.inject({
      method: 'POST',
      url: '/v1/webhook-endpoints',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { url: 'https://example.com/webhook' },
    });
    const { id } = JSON.parse(created.body) as { id: string };

    const listed = await fastify.inject({
      method: 'GET',
      url: '/v1/webhook-endpoints',
      headers: { authorization: `Bearer ${rawKey}` },
    });
    expect((JSON.parse(listed.body) as unknown[]).length).toBe(1);

    const revoked = await fastify.inject({
      method: 'DELETE',
      url: `/v1/webhook-endpoints/${id}`,
      headers: { authorization: `Bearer ${rawKey}` },
    });
    expect(revoked.statusCode).toBe(204);

    const endpoint = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id } });
    expect(endpoint.enabled).toBe(false);
    expect(endpoint.revokedAt).not.toBeNull();
  });

  it('rejects an API key missing the webhooks:write scope', async () => {
    const { fastify, rawKey } = await setupMerchant(['webhooks:read']);

    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/webhook-endpoints',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { url: 'https://example.com/webhook' },
    });

    expect(response.statusCode).toBe(403);
  });
});
