# Security

This describes what's actually implemented in Phase 0, not an aspirational
policy. See [`THREAT_MODEL.md`](THREAT_MODEL.md) for the threat-by-threat
breakdown and [`SECRETS.md`](SECRETS.md) for secret handling.

## Reporting a vulnerability

This is a pre-launch project with no production users yet. If you find a
security issue, open a private conversation with the maintainer rather than
a public GitHub issue.

## Authentication

- **Passwords**: Argon2id (`packages/crypto`), parameters configurable via
  `ARGON2_MEMORY_COST_KIB` / `ARGON2_TIME_COST` / `ARGON2_PARALLELISM`.
  Never logged (redacted by `packages/logger`'s field-name-based redaction,
  which also covers `token`, `apiKey`, `secret`, `authorization`, `cookie`,
  and their nested variants).
- **Sessions**: short-lived (15 min default) JWT access token in an httpOnly,
  `SameSite=Lax` cookie, plus an opaque, rotated, httpOnly `SameSite=Strict`
  refresh token scoped to `/v1/auth` only. Refresh token reuse (a token that
  was already rotated or is expired) revokes the entire rotation family —
  see `RefreshTokenService.rotate`.
- **2FA**: TOTP (RFC 6238, 30s step, ±1 step window). The secret is
  AES-256-GCM encrypted at rest (`ENCRYPTION_KEY`) and stays *disabled*
  until the user proves possession via `POST /v1/auth/2fa/verify` — an
  unconfirmed secret can never lock someone out of their own account.
- **Account lockout**: 5 failed attempts locks the account for 15 minutes
  (`AuthService.registerFailedLogin`). Suspended accounts (`status:
  SUSPENDED`) are hard-blocked regardless of `lockedUntil`.
- **User enumeration**: `POST /v1/auth/register` returns the same generic
  response whether or not the email already exists, and never re-issues a
  verification token for an existing account (avoids spam and timing
  differences).

## Authorization (BOLA)

Every dashboard request runs `OrganizationScopeGuard`, which re-derives the
caller's organization from a live database membership lookup — never from
client-supplied IDs alone. Object-level checks then filter every query by
that verified `organizationId` (e.g. `ApiKeysService.revoke` uses
`findFirst({ id, organizationId })`, not `findUnique({ id })`). Verified by
`test/security.integration.test.ts`: cross-organization API key revocation
returns 404 (not 403 — existence isn't leaked either), and header-based
organization spoofing (`X-Organization-Id`) is rejected with 403.

Role checks (`RolesGuard` + `@Roles('OWNER', 'ADMIN')`) gate mutating
organization/API-key endpoints — a plain `MEMBER` can read but not invite
members or create API keys.

## CSRF

Double-submit cookie: a non-httpOnly `cp_csrf` cookie is set at login, and
mutating dashboard requests must echo it as `X-CSRF-Token`
(`CsrfGuard`, constant-time comparison via `safeEqualHex`). The Merchant
API (Bearer token, no cookies) doesn't need this.

## Rate limiting

Redis-backed, per spec §30: login attempts are limited per IP+email
(`RATE_LIMIT_LOGIN_PER_MINUTE`, default 5/min), everything else per IP
(`RATE_LIMIT_GLOBAL_PER_MINUTE`, default 300/min). Both configurable via env.

## API keys

`cp_test_.../cp_live_...` — raw key shown exactly once at creation, stored
only as `HMAC-SHA256(API_KEY_PEPPER, raw)`. Test and live keys are
prefix-distinguishable and never interchangeable (spec §15). Scoped
(`invoices:read`, `invoices:write`, ... — spec §75); default creation
requires at least one explicit scope, never an implicit "all scopes."

## Transport & headers

`@fastify/helmet` sets standard security headers (CSP `default-src 'none'`
as a baseline — Phase 1's checkout page will need a scoped policy once it
renders real content). `@fastify/cors` restricts origins to `CORS_ORIGINS`
with `credentials: true`. In the bundled Docker Compose setup, nginx puts
web and api on one origin, so the browser never needs cross-origin requests
at all.

`COOKIE_SECURE` controls the cookies' `Secure` attribute and is deliberately
**not** derived from `NODE_ENV` — a `NODE_ENV=production` build can still run
behind plain HTTP in a local smoke test, and forcing `Secure` there would
silently break login. Real deployments behind TLS must set
`COOKIE_SECURE=true` (the schema default).

## Logging

Structured JSON (Pino) with request-id correlation
(`generateId('req')` fed into Fastify's `genReqId`). Redaction is
field-name-based and recursive up to 3 levels
(`packages/logger/src/redact-paths.ts`) — covers passwords, tokens, API
keys, secrets, private keys, mnemonics, authorization/cookie headers, and
signatures. Verified by unit tests that assert redaction actually happens,
not just that the list exists.

## Dependency scanning

`pnpm audit --audit-level=high` runs in CI as an informational step
(`continue-on-error: true`) in Phase 0. It becomes blocking once Phase 4's
security hardening pass defines an acceptable-risk policy — flagging every
transitive dev-dependency advisory as a hard CI failure this early would be
more noise than signal.

## What's explicitly out of scope for Phase 0

No custody, no private keys, no blockchain verification yet (nothing to
secure there until Phase 2). No admin panel yet (spec §32/§76 roles are
defined in `packages/shared` but not wired to any endpoint). No SAST/DAST
tooling yet — Phase 4 per the roadmap.
