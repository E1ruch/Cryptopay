import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './support/bootstrap.js';
import { cleanDatabase } from './support/db-cleanup.js';
import { createOrganization, registerVerifyAndLogin } from './support/test-user.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';

describe('security: CSRF, BOLA, rate limiting', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp();
      prisma = app.get(PrismaService);
    }
    await cleanDatabase(prisma);
    await app.get(RedisService).flushdb();
  });

  afterAll(async () => {
    if (app) {
      await cleanDatabase(app.get(PrismaService));
      await app.close();
    }
  });

  describe('CSRF (double-submit cookie)', () => {
    it('rejects a mutating request with a valid session but no CSRF header', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const session = await registerVerifyAndLogin(app, 'csrf-victim@example.com');

      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/organizations',
        headers: { cookie: session.cookieHeader }, // no x-csrf-token
        payload: { name: 'Should Not Be Created' },
      });

      expect(response.statusCode).toBe(403);
      const orgs = await prisma.organization.findMany();
      expect(orgs).toHaveLength(0);
    });

    it('rejects a mismatched CSRF header', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const session = await registerVerifyAndLogin(app, 'csrf-mismatch@example.com');

      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/organizations',
        headers: { cookie: session.cookieHeader, 'x-csrf-token': 'deadbeefdeadbeefdeadbeefdeadbeef' },
        payload: { name: 'Nope' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('allows the request when the CSRF header matches the cookie', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const session = await registerVerifyAndLogin(app, 'csrf-ok@example.com');

      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/organizations',
        headers: { cookie: session.cookieHeader, 'x-csrf-token': session.csrfToken },
        payload: { name: 'Legit Org' },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('BOLA: cross-organization access must always be denied', () => {
    it('org B cannot revoke org A\'s API key by guessing its id', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const sessionA = await registerVerifyAndLogin(app, 'orga-owner@example.com');
      await createOrganization(app, sessionA, 'Org A');

      const createKeyResponse = await fastify.inject({
        method: 'POST',
        url: '/v1/api-keys',
        headers: { cookie: sessionA.cookieHeader, 'x-csrf-token': sessionA.csrfToken },
        payload: { name: 'Org A key', environment: 'test', scopes: ['invoices:read'] },
      });
      const { id: apiKeyId } = JSON.parse(createKeyResponse.body) as { id: string };

      const sessionB = await registerVerifyAndLogin(app, 'orgb-owner@example.com');
      await createOrganization(app, sessionB, 'Org B');

      const revokeAttempt = await fastify.inject({
        method: 'DELETE',
        url: `/v1/api-keys/${apiKeyId}`,
        headers: { cookie: sessionB.cookieHeader, 'x-csrf-token': sessionB.csrfToken },
      });
      expect(revokeAttempt.statusCode).toBe(404);

      const stillActive = await prisma.apiKey.findUniqueOrThrow({ where: { id: apiKeyId } });
      expect(stillActive.revokedAt).toBeNull();
    });

    it('org B cannot read org A via X-Organization-Id header manipulation', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const sessionA = await registerVerifyAndLogin(app, 'orga2@example.com');
      const orgA = await createOrganization(app, sessionA, 'Org A2');

      const sessionB = await registerVerifyAndLogin(app, 'orgb2@example.com');
      await createOrganization(app, sessionB, 'Org B2');

      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/organizations/me',
        headers: { cookie: sessionB.cookieHeader, 'x-organization-id': orgA.id },
      });
      expect(response.statusCode).toBe(403);
    });

    it('a user with no organization gets 403, not a crash or someone else\'s data', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const session = await registerVerifyAndLogin(app, 'orgless@example.com');

      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/organizations/me',
        headers: { cookie: session.cookieHeader },
      });
      expect(response.statusCode).toBe(403);
    });

    it('only OWNER/ADMIN can invite members — a plain MEMBER is forbidden', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const owner = await registerVerifyAndLogin(app, 'owner3@example.com');
      const org = await createOrganization(app, owner, 'Org Three');

      const memberSession = await registerVerifyAndLogin(app, 'member3@example.com');
      await prisma.membership.create({
        data: { userId: memberSession.userId, organizationId: org.id, role: 'MEMBER' },
      });

      const inviteAttempt = await fastify.inject({
        method: 'POST',
        url: '/v1/organizations/me/members',
        headers: { cookie: memberSession.cookieHeader, 'x-csrf-token': memberSession.csrfToken },
        payload: { email: 'someone-else@example.com', role: 'MEMBER' },
      });
      expect(inviteAttempt.statusCode).toBe(403);
    });
  });

  describe('rate limiting', () => {
    it('throttles repeated login attempts for the same email/IP', async () => {
      const fastify = app.getHttpAdapter().getInstance();
      const email = 'ratelimited@example.com';

      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        const response = await fastify.inject({
          method: 'POST',
          url: '/v1/auth/login',
          payload: { email, password: 'wrong' },
        });
        statuses.push(response.statusCode);
      }

      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(5)).toEqual([429, 429]);
    });
  });
});
