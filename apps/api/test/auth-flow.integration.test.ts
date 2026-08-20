import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp, parseCookieHeader, parseSetCookies, toCookieHeader } from './support/bootstrap.js';
import { cleanDatabase } from './support/db-cleanup.js';
import { registerAndVerify, registerVerifyAndLogin } from './support/test-user.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { EmailVerificationService } from '../src/auth/tokens/email-verification.service.js';
import { RedisService } from '../src/redis/redis.service.js';

describe('auth flow (register -> verify -> login -> refresh -> logout)', () => {
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

  it('creates a PENDING_VERIFICATION user on register and never returns whether the email already existed', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const email = 'alice@example.com';

    const first = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'password123' },
    });
    const second = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'password123' },
    });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(JSON.parse(first.body)).toEqual(JSON.parse(second.body));

    const users = await prisma.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    expect(users[0]?.status).toBe('PENDING_VERIFICATION');
  });

  it('rejects login before the email is verified', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const email = 'unverified@example.com';
    await fastify.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'password123' },
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'password123' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('activates the account on valid email verification and allows login', async () => {
    const session = await registerVerifyAndLogin(app, 'verified@example.com');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    expect(user.status).toBe('ACTIVE');
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(session.cookieHeader).toContain('cp_at=');
    expect(session.cookieHeader).toContain('cp_rt=');
  });

  it('rejects an already-consumed or invalid verification token', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const email = 'reuse@example.com';
    await fastify.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password: 'password123' } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    const rawToken = await app.get(EmailVerificationService).issue(user.id);
    const okResponse = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token: rawToken },
    });
    expect(okResponse.statusCode).toBe(200);

    const replay = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token: rawToken },
    });
    expect(replay.statusCode).toBe(400);

    const garbage = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token: 'not-a-real-token' },
    });
    expect(garbage.statusCode).toBe(400);
  });

  it('locks out login after repeated failed attempts', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const email = 'lockout@example.com';
    // Uses registerAndVerify (no setup login call) so the 5 failed attempts
    // below map 1:1 onto both the lockout threshold and the login rate
    // limit, which are both configured to 5/min in this environment.
    await registerAndVerify(app, email);

    let lastStatus = 0;
    for (let i = 0; i < 5; i += 1) {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password: 'wrong-password' },
      });
      lastStatus = response.statusCode;
    }
    expect(lastStatus).toBe(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.status).toBe('LOCKED');
    expect(user.lockedUntil).not.toBeNull();
    // A 6th HTTP call here would also collide with the login rate limit
    // (also 5/min in this environment) — the DB assertions above already
    // prove the lockout itself, independent of the correct password.
  });

  it('rotates the refresh token and issues a new access token on refresh', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const session = await registerVerifyAndLogin(app, 'rotate@example.com');

    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: session.cookieHeader },
    });
    expect(response.statusCode).toBe(200);

    const newCookies = parseSetCookies(response.headers['set-cookie']);
    const oldCookies = parseCookieHeader(session.cookieHeader);
    expect(newCookies.cp_rt).toBeDefined();
    expect(newCookies.cp_rt).not.toBe(oldCookies.cp_rt);
  });

  it('detects refresh token reuse and revokes the entire rotation family', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const session = await registerVerifyAndLogin(app, 'theft@example.com');

    const firstRefresh = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: session.cookieHeader },
    });
    const rotatedCookies = parseSetCookies(firstRefresh.headers['set-cookie']);
    const rotatedCookieHeader = toCookieHeader(rotatedCookies);

    // Reuse the now-stale original refresh token — this must be treated as theft.
    const reuseAttempt = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: session.cookieHeader },
    });
    expect(reuseAttempt.statusCode).toBe(401);

    // The legitimately rotated token must also now be dead (whole family revoked).
    const legitFollowUp = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: rotatedCookieHeader },
    });
    expect(legitFollowUp.statusCode).toBe(401);
  });

  it('logout revokes the refresh token so it can no longer be used', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const session = await registerVerifyAndLogin(app, 'logout@example.com');

    const logoutResponse = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie: session.cookieHeader, 'x-csrf-token': session.csrfToken },
    });
    expect(logoutResponse.statusCode).toBe(200);

    const refreshAfterLogout = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: session.cookieHeader },
    });
    expect(refreshAfterLogout.statusCode).toBe(401);
  });

  it('enrolls and enforces 2FA end to end', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const email = '2fa@example.com';
    const session = await registerVerifyAndLogin(app, email);

    const enableResponse = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/2fa/enable',
      headers: { cookie: session.cookieHeader, 'x-csrf-token': session.csrfToken },
    });
    expect(enableResponse.statusCode).toBe(200);
    const { secretBase32 } = JSON.parse(enableResponse.body) as { secretBase32: string };

    const { TOTP, Secret } = await import('otpauth');
    const code = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    }).generate();

    const confirmResponse = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/2fa/verify',
      headers: { cookie: session.cookieHeader, 'x-csrf-token': session.csrfToken },
      payload: { code },
    });
    expect(confirmResponse.statusCode).toBe(200);

    // Password alone is no longer sufficient.
    const loginWithoutCode = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'password123' },
    });
    expect(loginWithoutCode.statusCode).toBe(401);

    const freshCode = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    }).generate();
    const loginWithCode = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'password123', totpCode: freshCode },
    });
    expect(loginWithCode.statusCode).toBe(200);
  });
});
