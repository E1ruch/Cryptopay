# Architecture

## High-level view

```text
                         ┌───────────────────────────┐
                         │   apps/web (Next.js)      │
                         │  Merchant Dashboard        │
                         │  (RU/EN, next-intl)        │
                         └─────────────┬─────────────┘
                                       │ HTTPS (nginx same-origin in Docker)
                         ┌─────────────▼─────────────┐
                         │   apps/api (NestJS+Fastify)│
                         │  REST /v1, OpenAPI, Auth   │
                         └──────┬───────────┬─────────┘
              ┌─────────────────┤           ├─────────────────┐
              ▼                 ▼           ▼                 ▼
       Auth/Sessions      Organizations   API Keys        Audit Log
              │                 │           │                 │
              └─────────────────┼───────────────────────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    ▼                           ▼
              PostgreSQL (Prisma)          Redis (ioredis)
             source of truth               rate limiting, BullMQ
                    │                           │
                    │                           ▼
                    │                   apps/worker (BullMQ)
                    │                           │
                    │                    health-check queue now;
                    │                    blockchain.scan, payment.detect,
                    │                    webhook.dispatch etc. in Phase 1+
                    ▼
              Audit trail (append-only)
```

Phase 0 has no blockchain component. `apps/worker` exists and runs a
`health-check` job (pings Postgres + Redis) purely to establish the queue
infrastructure and Docker/CI wiring before Phase 1 adds real payment queues.

## Repository layout & dependency graph

```text
apps/api ──────depends on──> packages/database, config, crypto, validation,
                              logger, shared
apps/worker ───depends on──> packages/database, config, logger, shared
apps/web ──────depends on──> packages/validation (shared Zod schemas — the
                              same registerSchema/loginSchema validate on
                              both client and server), packages/shared

packages/database ─────depends on──> nothing (Prisma schema — bottom of the graph)
packages/config ───────depends on──> zod only
packages/crypto ───────depends on──> node:crypto, argon2
packages/shared ───────depends on──> nothing
packages/validation ───depends on──> packages/shared, zod
packages/logger ───────depends on──> pino
```

Every package publishes only `dist/` (see each `package.json`'s `files`
field) — source and tests never leak into consumers or Docker images.

## apps/api module map

```text
AppModule
 ├─ ConfigModule        (@Global) — loadEnv() as an injectable ENV token
 ├─ DatabaseModule       (@Global) — PrismaService (extends PrismaClient)
 ├─ RedisModule          (@Global) — RedisService (extends ioredis.Redis)
 ├─ AuditModule          (@Global) — AuditService, appends to audit_logs
 ├─ AuthModule           — AuthController, AuthService, AccessTokenService,
 │                         RefreshTokenService, EmailVerificationService,
 │                         TotpService
 ├─ OrganizationsModule  (imports AuthModule for SessionAuthGuard's DI)
 └─ ApiKeysModule        (imports AuthModule)
```

`common/` holds cross-cutting pieces used by every module: guards
(`SessionAuthGuard`, `OrganizationScopeGuard`, `RolesGuard`, `CsrfGuard`,
`ApiKeyAuthGuard`, `RedisRateLimitGuard`), the Zod validation pipe, the
global exception filter, and param decorators
(`@CurrentUserId()`, `@CurrentOrganizationId()`).

## Two authentication mechanisms, on purpose

The dashboard (browser, cookies) and the future Merchant API (server-to-server,
Bearer tokens) have different threat models, so they use different guards
rather than one unified "auth" concept:

- **Dashboard sessions** — `SessionAuthGuard` verifies a short-lived JWT
  (HS256, 15 min) in an httpOnly `cp_at` cookie. Refresh happens via a
  separate opaque, rotated token (`cp_rt`, scoped to `/v1/auth`, 30 days).
  Reuse of an already-rotated refresh token is treated as theft and revokes
  the entire rotation family (`RefreshTokenService.rotate`) — see
  `docs/security/THREAT_MODEL.md`.
- **Merchant API keys** — `ApiKeyAuthGuard` validates
  `Authorization: Bearer cp_test_.../cp_live_...` by hashing the raw key
  with `HMAC-SHA256(API_KEY_PEPPER, raw)` and looking it up directly (no
  iteration needed, unlike per-key-salted schemes). Built and tested in
  Phase 0 even though no API-key-authenticated business endpoints exist yet,
  since it's exactly what Phase 1's `/v1/invoices` etc. will use.

Every session request also goes through `OrganizationScopeGuard`, which
resolves the caller's organization from an `X-Organization-Id` header (or
their sole membership) and re-verifies membership against the database on
**every request** — this is the core defense against BOLA (spec §12/§74):
a `userId` alone never implies access to a given organization's resources.

## CSRF

Dashboard mutations use double-submit cookies: a non-httpOnly `cp_csrf`
cookie is set at login, and the client must echo it back as
`X-CSRF-Token` on every state-changing request. `CsrfGuard` compares the
two in constant time. The Merchant API (Bearer auth, no cookies) doesn't
need this — CSRF specifically exploits ambient cookie auth.

## Rate limiting

`RedisRateLimitGuard` is a fixed-window counter (`INCR` + `EXPIRE`) keyed by
category:

- `login` — IP + email, `RATE_LIMIT_LOGIN_PER_MINUTE` (default 5/min)
- `global` — IP only, `RATE_LIMIT_GLOBAL_PER_MINUTE` (default 300/min)

Both are env-configurable rather than hardcoded, per spec §30.

## Error format

Every API error is `{ error: { code, message, request_id, details? } }`
(spec §55). `packages/shared`'s `AppError` hierarchy
(`ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`,
`ConflictError`, `RateLimitedError`, `InternalError`) maps to HTTP status
codes; `AppExceptionFilter` catches everything (including Nest's own
built-in exceptions and genuinely unexpected errors) and never lets a raw
stack trace or internal message reach the client — unexpected errors become
a generic `InternalError` with the original preserved only in server logs.

## Docker images

Each app has its own multi-stage `Dockerfile` built from the **monorepo
root** as build context (pnpm workspaces need every `package.json` present
to resolve the lockfile). `api` and `worker` use `pnpm deploy --prod` to
produce a pruned, production-only `node_modules`; `web` does the same
(rather than Next's `output: standalone`, which had unresolved
`@swc/helpers` tracing issues under pnpm's workspace layout as of Next 16).
A dedicated `migrate` image (unpruned, since `prisma` itself is a
devDependency) runs `prisma migrate deploy` as a one-off job before `api`
and `worker` start (`depends_on: condition: service_completed_successfully`).

nginx fronts `web` and `api` on one origin so the browser never needs CORS;
`NEXT_PUBLIC_API_BASE_URL` is left empty at build time in that setup so the
client calls a relative `/v1/...` path.

## Why NestJS + Fastify + Next 16

Confirmed working together (ESM throughout, `moduleResolution: NodeNext` for
api/worker, `bundler` for web) — this pairing has real friction points
(documented in code comments where hit): NestJS 10 bundles Fastify 4
internally, which breaks `@fastify/*` plugin types built against Fastify 5 —
resolved by upgrading to NestJS 11 (Fastify 5 native) and pinning a single
`fastify` version repo-wide via `pnpm.overrides`. Vitest's default esbuild
transform also drops TypeScript decorator metadata that Nest's DI needs —
resolved with `unplugin-swc` (NestJS's own documented Vitest setup).
