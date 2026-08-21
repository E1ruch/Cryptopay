# Security

This describes what's actually implemented through Phase 1, not an
aspirational policy. See [`THREAT_MODEL.md`](THREAT_MODEL.md) for the
threat-by-threat breakdown and [`SECRETS.md`](SECRETS.md) for secret
handling.

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
(`RATE_LIMIT_LOGIN_PER_MINUTE`, default 5/min), the public checkout page per
IP (`RATE_LIMIT_CHECKOUT_PER_MINUTE`, default 100/min — it has no other
identity to key off of), everything else per IP
(`RATE_LIMIT_GLOBAL_PER_MINUTE`, default 300/min). All configurable via env.

## API keys

`cp_test_.../cp_live_...` — raw key shown exactly once at creation, stored
only as `HMAC-SHA256(API_KEY_PEPPER, raw)`. Test and live keys are
prefix-distinguishable and never interchangeable (spec §15). Scoped
(`invoices:read`, `invoices:write`, ... — spec §75); default creation
requires at least one explicit scope, never an implicit "all scopes," and
`ScopesGuard` (Phase 1) actually enforces the granted scopes against each
route's `@RequireScopes(...)` — scopes were defined in Phase 0 but nothing
checked them until Phase 1's merchant API needed real endpoints to protect.

## Public checkout page

`GET/POST /v1/checkout/:id` (spec §19) intentionally takes no session and
no API key — the invoice's own opaque public id is the access boundary, and
the response (`CheckoutView`) is a narrower projection than the
authenticated `InvoiceView`: no `organizationId`, `externalId`, or
`metadata` ever crosses into it (spec §48). Protected instead by a
dedicated per-IP rate limit (see above). The customer never sees a
different invoice's data because ids are opaque, high-entropy, and looked
up directly — there's no enumerable sequence to walk.

## Webhook delivery (SSRF, signing, replay)

Merchant-registered webhook URLs are untrusted, attacker-influenceable
destinations (spec §29) — `assertSafeWebhookUrl` (`packages/webhooks`)
rejects anything non-HTTPS and resolves the hostname, rejecting any address
in a loopback/RFC1918/link-local/cloud-metadata range (including
`169.254.169.254`, the common cloud-metadata SSRF target). This check runs
**twice**: once when the merchant registers/edits the URL, and again
immediately before every delivery attempt, since DNS is attacker-controlled
and can rebind between the two (a TOCTOU otherwise). Delivery never follows
redirects (`redirect: 'manual'` — a 3xx could repoint at an internal
address) and is timeout-bounded.

Every delivery is HMAC-SHA256 signed over `${timestamp}.${body}` with a
per-endpoint secret (`X-CryptoPay-Signature`/`-Timestamp`/`-Event-ID`
headers, spec §27/§61). The reference `verifyWebhookSignature` merchants
would use also rejects a stale timestamp outside a tolerance window,
giving replay protection to any merchant who checks it. The signing secret
itself is AES-256-GCM encrypted at rest (`ENCRYPTION_KEY`), never plaintext
or hashed — delivery needs it back to compute each signature.

## Payment integrity

The server-side detection pipeline is the *only* thing that can move an
Invoice/Payment to a paid-adjacent state (spec §22: never trust a customer
or frontend claim of "I paid"). `packages/payments`' explicit state
machines (`assertInvoiceTransition`/`assertPaymentTransition`, spec §87-88)
throw `InvalidStateTransitionError` on any transition outside the declared
map — there is no code path that writes an invoice `status` column without
going through one of these checks first. Amount comparison uses
`Prisma.Decimal` throughout, never a JS float (spec §18) — an invoice is
only ever `PAID` on an *exact* match; under/over is flagged, never
silently rounded or accepted (spec §44/§45).

## Transport & headers

`@fastify/helmet` sets standard security headers on **API** responses only
(CSP `default-src 'none'` as a baseline — appropriate there, since the API
never serves renderable HTML). `apps/web` — including the public checkout
page, which is the one page here an attacker-adjacent audience actually
loads — has **no CSP configured of its own yet**; the API's helmet policy
doesn't apply to it at all, since Next.js serves those responses
independently. Worth a real look before checkout handles anything more
sensitive than it does today. `@fastify/cors` restricts origins to
`CORS_ORIGINS` with `credentials: true`. In the bundled Docker Compose
setup, nginx puts web and api on one origin, so the browser never needs
cross-origin requests at all.

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

## What's explicitly out of scope through Phase 2

Still no custody, no private keys anywhere in the codebase (spec §42) —
Phase 2's real `EvmBlockchainAdapter` only ever reads chain state via a
public RPC, and deposit addresses are merchant-supplied
(`MerchantWalletAddress`), never generated or held by the platform; see
`docs/security/THREAT_MODEL.md`'s "Explicitly not attempted" section.
What Phase 2 *did* bring into scope — reorg handling and wrong-token
spoofing — is implemented (`REORG_DETECTED` state, canonical
contract-address token identity); what's still deferred is **RPC provider
trust**: a single public `BASE_SEPOLIA_RPC_URL` endpoint with no failover
or cross-checking (spec §38's "RPC Provider Manager" is Phase 3).
No admin panel yet (spec §32/§76 roles are defined in `packages/shared`
but not wired to any endpoint). No SAST/DAST tooling yet — Phase 4 per the
roadmap. No CSP for `apps/web` (see "Transport & headers" above). No
generic `Idempotency-Key` request-header handling (spec §52) — only
`Invoice.external_id`'s narrower dedup exists; see `THREAT_MODEL.md`.
