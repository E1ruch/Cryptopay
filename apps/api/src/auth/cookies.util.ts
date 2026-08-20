import type { FastifyReply } from 'fastify';

export interface AuthCookieConfig {
  secure: boolean;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

export interface AuthCookieValues {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

export function setAuthCookies(
  reply: FastifyReply,
  cfg: AuthCookieConfig,
  values: AuthCookieValues,
): void {
  const secure = cfg.secure;

  reply.setCookie('cp_at', values.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: cfg.accessTtlSeconds,
  });
  // Scoped to /v1/auth only — the refresh token never needs to leave the auth endpoints.
  reply.setCookie('cp_rt', values.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/v1/auth',
    maxAge: cfg.refreshTtlSeconds,
  });
  // Not httpOnly — the frontend must read it to echo it back as X-CSRF-Token (double-submit).
  reply.setCookie('cp_csrf', values.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: cfg.refreshTtlSeconds,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('cp_at', { path: '/' });
  reply.clearCookie('cp_rt', { path: '/v1/auth' });
  reply.clearCookie('cp_csrf', { path: '/' });
}
