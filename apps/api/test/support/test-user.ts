import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../../src/database/prisma.service.js';
import { EmailVerificationService } from '../../src/auth/tokens/email-verification.service.js';
import { parseSetCookies, toCookieHeader } from './bootstrap.js';

export interface RegisteredSession {
  userId: string;
  email: string;
  cookieHeader: string;
  csrfToken: string;
}

/** Registers and verifies (via a freshly minted token, bypassing email
 * delivery which doesn't exist yet in Phase 0) without logging in — for
 * tests that need to control login attempts themselves (e.g. lockout/rate
 * limit tests, where an extra setup login would consume a rate-limit slot). */
export async function registerAndVerify(
  app: NestFastifyApplication,
  email: string,
  password = 'password123',
): Promise<{ userId: string }> {
  const fastify = app.getHttpAdapter().getInstance();

  await fastify.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password } });

  const prisma = app.get(PrismaService);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  const emailVerification = app.get(EmailVerificationService);
  const rawToken = await emailVerification.issue(user.id);
  await fastify.inject({
    method: 'POST',
    url: '/v1/auth/verify-email',
    payload: { token: rawToken },
  });

  return { userId: user.id };
}

/** registerAndVerify() + a real login call — returns a ready-to-use
 * authenticated session for tests that only care about what happens next. */
export async function registerVerifyAndLogin(
  app: NestFastifyApplication,
  email: string,
  password = 'password123',
): Promise<RegisteredSession> {
  const fastify = app.getHttpAdapter().getInstance();
  const { userId } = await registerAndVerify(app, email, password);

  const loginResponse = await fastify.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password },
  });

  const cookies = parseSetCookies(loginResponse.headers['set-cookie']);
  return {
    userId,
    email,
    cookieHeader: toCookieHeader(cookies),
    csrfToken: cookies.cp_csrf ?? '',
  };
}

export async function createOrganization(
  app: NestFastifyApplication,
  session: RegisteredSession,
  name: string,
): Promise<{ id: string; slug: string }> {
  const fastify = app.getHttpAdapter().getInstance();
  const response = await fastify.inject({
    method: 'POST',
    url: '/v1/organizations',
    headers: { cookie: session.cookieHeader, 'x-csrf-token': session.csrfToken },
    payload: { name },
  });
  return JSON.parse(response.body) as { id: string; slug: string };
}

/** Creates a merchant API key via the dashboard endpoint and returns the raw
 * key exactly as `ApiKeyAuthGuard` expects it — `Authorization: Bearer <rawKey>`. */
export async function createApiKey(
  app: NestFastifyApplication,
  session: RegisteredSession,
  scopes: string[] = ['invoices:read', 'invoices:write'],
  environment: 'test' | 'live' = 'test',
): Promise<{ id: string; rawKey: string }> {
  const fastify = app.getHttpAdapter().getInstance();
  const response = await fastify.inject({
    method: 'POST',
    url: '/v1/api-keys',
    headers: { cookie: session.cookieHeader, 'x-csrf-token': session.csrfToken },
    payload: { name: 'Test key', environment, scopes },
  });
  return JSON.parse(response.body) as { id: string; rawKey: string };
}
