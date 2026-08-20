import type { MembershipRole } from '@cryptopay/shared';
import 'fastify';

export interface AuthCookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  maxAge?: number;
  domain?: string;
}

// Populated by SessionAuthGuard / ApiKeyAuthGuard / OrganizationScopeGuard.
// Never set directly from client input — always derived from a verified
// session or API key plus a database-backed membership/ownership check.
//
// Also re-declares the request.cookies / reply.setCookie / clearCookie
// surface that @fastify/cookie augments fastify with — its own bundled
// types clash structurally with @nestjs/platform-fastify's re-exported
// FastifyInstance type (duplicate nominal type, same package/version
// underneath), so we augment directly against the module identity our own
// code imports from instead of relying on that plugin's merge.
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    organizationId?: string;
    membershipRole?: MembershipRole;
    apiKeyId?: string;
    apiKeyScopes?: string[];
    cookies: Record<string, string | undefined>;
  }

  interface FastifyReply {
    setCookie(name: string, value: string, options?: AuthCookieOptions): FastifyReply;
    clearCookie(name: string, options?: AuthCookieOptions): FastifyReply;
  }
}
