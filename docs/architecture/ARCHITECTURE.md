# Architecture

## High-level view

```text
┌──────────────────────┐        ┌───────────────────────────────────┐
│  apps/web (Next.js)  │        │  apps/web /pay/[id]                │
│  Merchant Dashboard   │        │  Public checkout (own root layout, │
│  (RU/EN, next-intl,   │        │  English-only, no session/API key) │
│  session cookies)     │        └──────────────────┬──────────────────┘
└──────────┬───────────┘                            │
           │ HTTPS (nginx same-origin in Docker)     │
           ▼                                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    apps/api (NestJS + Fastify)                   │
│  REST /v1, OpenAPI — three auth mechanisms, see below             │
└───┬─────────┬──────────┬───────────┬───────────┬────────┬────────┘
    ▼         ▼          ▼           ▼           ▼        ▼
  Auth/    Orgs/API   Invoices/   Checkout    Webhook    Dashboard
  Sessions  Keys      Payments    (public)   Endpoints   (invoices/
                      (BlockchainAdapter)                webhooks reads)
    │         │          │           │           │        │
    └─────────┴──────────┴─────┬─────┴───────────┴────────┘
                                │
                   ┌────────────┴─────────────┐
                   ▼                           ▼
             PostgreSQL (Prisma)          Redis (ioredis)
            source of truth               rate limiting, BullMQ
                   │                           │
                   │                           ▼
                   │                   apps/worker (BullMQ)
                   │                           │
                   │                    health-check, webhookDispatch,
                   │                    webhookRetry always run;
                   │                    blockchainScan/paymentConfirm run
                   │                    only in BLOCKCHAIN_MODE=evm — see
                   │                    "Payment detection pipeline" below
                   ▼
             Audit trail (append-only)
```

Payment *detection* (scanning the chain, matching transfers, advancing
confirmations) runs in one of two places depending on `BLOCKCHAIN_MODE`
(spec §93): **inside `apps/api`** as an in-process poller in the default
`fake` mode, or on **`apps/worker`**'s `blockchainScan`/`paymentConfirm`
queues in `evm` mode (Phase 2 — real Base Sepolia adapter). See "Payment
detection & confirmation pipeline" below for why both exist.

## Repository layout & dependency graph

```text
apps/api ──────depends on──> packages/database, config, crypto, validation,
                              logger, shared, payments, blockchain, webhooks
apps/worker ───depends on──> packages/database, config, logger, shared,
                              crypto, webhooks, blockchain, payments (the
                              last two added in Phase 2, for
                              blockchain-scan/payment-confirm queues)
apps/web ──────depends on──> packages/validation (shared Zod schemas — the
                              same registerSchema/loginSchema validate on
                              both client and server), packages/shared

packages/database ─────depends on──> nothing (Prisma schema — bottom of the graph)
packages/config ───────depends on──> zod only
packages/crypto ───────depends on──> node:crypto, argon2
packages/shared ───────depends on──> nothing
packages/validation ───depends on──> packages/shared, zod
packages/logger ───────depends on──> pino
packages/payments ─────depends on──> packages/database (types only), shared
                              — pure domain logic: Invoice/Payment state
                              machines, amount evaluation, transfer matching.
                              No Prisma calls, no I/O.
packages/blockchain ───depends on──> packages/database (types only), shared, viem
                              — BlockchainAdapter interface, FakeBlockchainAdapter
                              (Phase 1), EvmBlockchainAdapter (Phase 2, Base
                              Sepolia via viem), the per-network adapter
                              registry, and the static token contract registry.
packages/webhooks ─────depends on──> packages/crypto, shared
                              — HMAC signing, SSRF-safe URL validation,
                              retry-delay schedule, delivery (fetch). No
                              Prisma, no BullMQ — apps/worker owns that wiring.
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
 ├─ ApiKeysModule        (imports AuthModule)
 ├─ BlockchainModule     — provides BlockchainAdapterRegistry, resolved by
 │                         `Invoice.network` (`base` → FakeBlockchainAdapter
 │                         or EvmBlockchainAdapter depending on
 │                         BLOCKCHAIN_MODE); the only module Phase 3's next
 │                         network needs a new registry entry in
 ├─ WalletAddressesModule — session-authenticated: get/set the org's
 │                         MerchantWalletAddress per (network, token) — spec
 │                         §42, see "Blockchain adapter abstraction" below
 ├─ InvoicesModule       — merchant API (ApiKeyAuthGuard): create/get invoice
 │                         (imports WalletAddressesModule, not BlockchainModule
 │                         directly — it never touches the adapter itself)
 ├─ PaymentsModule       — merchant API: POST .../simulate-payment (dev/test
 │                         only, fake-adapter-guarded), and PaymentsService,
 │                         the in-process poller that's active only in
 │                         BLOCKCHAIN_MODE=fake (imports BlockchainModule)
 ├─ WebhooksModule       — merchant API: webhook endpoint CRUD
 ├─ CheckoutModule       — public, unauthenticated: GET checkout view +
 │                         POST simulate-payment for the customer-facing page
 └─ DashboardModule      — session-authenticated reads/writes for the
                           browser dashboard: invoices list/get, webhook
                           endpoint CRUD + delivery status (imports
                           InvoicesModule, WebhooksModule, AuthModule)
```

`common/` holds cross-cutting pieces used by every module: guards
(`SessionAuthGuard`, `OrganizationScopeGuard`, `RolesGuard`, `CsrfGuard`,
`ApiKeyAuthGuard`, `ScopesGuard`, `RedisRateLimitGuard`), the Zod validation
pipe, the global exception filter, and param decorators
(`@CurrentUserId()`, `@CurrentOrganizationId()`, `@CurrentApiKeyId()`).

## Blockchain adapter abstraction

Payment Core never talks to a chain directly (spec §20) — everything goes
through the `BlockchainAdapter` interface in `packages/blockchain`:

```ts
interface BlockchainAdapter {
  validateAddress(address: string): boolean;
  getLatestBlock(): Promise<number>;
  getTransaction(txHash: string): Promise<BlockchainTransaction | null>;
  getTokenTransfers(fromBlock: number, toBlock: number): Promise<TokenTransfer[]>;
  getConfirmations(txHash: string): Promise<number>;
}
```

One adapter instance serves exactly one network (spec §20's own
illustrative interface has no `network` parameter, on the assumption a
registry picks the right instance per `Invoice.network`).
`createBlockchainAdapterRegistry` (`packages/blockchain`) builds that
registry — currently one entry, `base` — from a `BLOCKCHAIN_MODE` flag:
`fake` (default) resolves to `FakeBlockchainAdapter`, `evm` resolves to
`EvmBlockchainAdapter` (Base Sepolia, via `viem`, `BASE_SEPOLIA_RPC_URL`).
`apps/api/src/blockchain/blockchain.module.ts` wraps this in a small
`BlockchainAdapterRegistry` NestJS provider (`.get(network)`, throws
`ValidationError` for an unregistered network); `apps/worker/src/main.ts`
builds the same registry directly (no NestJS there) when starting the
`evm`-only queues. Adding a second network later is one more registry
entry — nothing above this layer changes.

Note `getTokenTransfers` takes a **block range**, not a single block
number — one ranged `eth_getLogs`-style call per scan tick, not one call
per block (this changed from Phase 1's `(blockNumber)` signature once a
real, rate-limited RPC was in the picture).

`generateDepositAddress()` — Phase 1's method for minting a fresh address
per invoice — was **removed from the interface entirely**, not carried
forward into `EvmBlockchainAdapter`. Spec §42 (custody boundary) forbids
the platform from holding a key of any kind, and a generated-per-invoice
address implies exactly that. Instead:

- **`MerchantWalletAddress`** (Prisma model: `organizationId, network,
  token, address`, unique per triple) holds the merchant's *own* receiving
  address, entered once via `WalletAddressesService`/`WalletAddressesModule`
  (dashboard: Settings → Wallet address) and reused across every invoice on
  that network/token. `WalletAddressesService.setDepositAddress` validates
  the address via the real adapter's `validateAddress()` before saving.
- `InvoicesService.create()` reads it (`WalletAddressesService.getDepositAddress`)
  instead of generating anything; in `BLOCKCHAIN_MODE=fake` a missing address
  is auto-provisioned with a random `generateFakeAddress()` value (keeps
  Phase 0/1's "create org → create invoice" flow working with zero manual
  setup) — in `evm` mode there's no such fallback, invoice creation fails
  with a clear `ValidationError` until the merchant sets a real address.
- **Consequence for matching**: because one address is now shared across
  every invoice on a network/token (not one dedicated address per invoice
  like Phase 1), `Invoice.paymentAddress` is no longer globally unique in
  the schema, and the scanner needs more than an address lookup to know
  *which* pending invoice a transfer is for — see `selectMatchingInvoice`
  below.

`FakeBlockchainAdapter` (Phase 1) and `EvmBlockchainAdapter` (Phase 2)
satisfy the identical contract: `getTransaction`/`getConfirmations` both
distinguish "doesn't exist" (`null` / thrown `NotFoundError`) from "exists
but not final yet," and confirmations only ever accrue over real elapsed
time/blocks (spec §22/§24 forbid trusting an unconfirmed transfer).
`simulatePayment()` stays fake-adapter-only, guarded by an
`instanceof FakeBlockchainAdapter` check in `PaymentsService` — a real
adapter only ever *observes* chain state, it never creates it.

`packages/payments` has the domain rules that consume adapter output:
`assertInvoiceTransition`/`assertPaymentTransition` (explicit state
machines, spec §87 — invalid transitions throw rather than silently
applying), `evaluatePaymentAmount` (exact/underpaid/overpaid, using
`Prisma.Decimal`, never a JS float — spec §18), `matchesInvoice`
(network+token+address matching, spec §47), and `selectMatchingInvoice`
(Phase 2 — given several PENDING invoices sharing one address, picks the
one whose expected amount exactly matches the transfer, falling back to
the oldest pending invoice otherwise; two invoices pending on the same
address for the exact same amount at once aren't disambiguated further —
a documented, known limitation, same spirit as Phase 1's other deferred
gaps below).

## Payment detection & confirmation pipeline

Which process runs detection depends on `BLOCKCHAIN_MODE`:

- **`fake` (default)** — `apps/api/src/payments/payments.service.ts`'s
  `PaymentsService` runs the whole detect → confirm → finalize pipeline
  (spec §21) as an **in-process `setInterval`, once a second, inside the
  API server**. Reason: `FakeBlockchainAdapter`'s state (simulated
  transfers, block number) is in-memory and process-local. If detection ran
  in `apps/worker` — a separate OS process from `apps/api`, which owns the
  adapter instance customers actually "pay" into via the checkout page's
  simulate button — the worker's own separate fake-adapter instance would
  never see those simulated payments at all. `onModuleInit` no-ops entirely
  when `BLOCKCHAIN_MODE=evm`; only `simulatePayment`/
  `simulatePaymentForCheckout` stay live in both modes, for dev/test.
- **`evm` (Phase 2)** — detection/confirmation runs on
  `apps/worker/src/queues/blockchain-scan.queue.ts` and
  `payment-confirm.queue.ts` instead, following the exact
  `createXQueue`/`scheduleX`/`createXWorker` + standalone exported `run*`
  pattern `webhook-dispatch.queue.ts`/`webhook-retry.queue.ts` already
  established. This is what a real, RPC-backed adapter (a genuine shared
  source of truth any process can query) actually enables — the process
  boundary that forced Phase 1's in-process poller doesn't apply anymore.

A few things changed in the move, beyond just "which process runs this":

- **The scan cursor moved from memory to the database.** Phase 1's
  `lastScannedBlock` was a field on the NestJS singleton; a BullMQ worker
  has no equivalent durable in-process state across restarts, so it's now
  `BlockchainScanCursor` (one row per network, `-1` meaning "nothing
  scanned yet" — a plain `0` default would wrongly mean "block 0 already
  scanned" and skip it). `blockchain-scan.queue.ts` reads/advances it each
  tick; a real chain's block numbers are monotonic and final once produced,
  so (unlike Phase 1's fake chain) the cursor advances to the full latest
  block each pass, not `latestBlock - 1`.
- **Reorg handling is real now** (spec §25). If a `CONFIRMING` payment's
  transaction stops resolving (`getConfirmations` throws `NotFoundError`),
  `payment-confirm.queue.ts` moves it to `REORG_DETECTED` rather than
  assuming it's gone — the next tick re-checks, and either resumes
  `CONFIRMING` (transaction reappeared) or, after a 10-minute grace window
  with no sign of it, fails the payment. A `DETECTED` payment (never
  confirmed at all) has no such grace period — the payment state machine
  only allows `REORG_DETECTED` as a transition *from* `CONFIRMING` — so it
  fails immediately, same as Phase 1's "orphaned payment" handling for a
  restarted fake adapter (a related but different cause — the fake chain
  literally forgot the tx; a real chain saying "not found" for a
  `CONFIRMING` payment is a genuine reorg signal, not a forgetful adapter).
- **Invoice expiry moved into the confirm queue.** `expireOverdueInvoices`
  was part of every Phase 1 tick alongside detect/confirm; in `evm` mode
  it's now the first step of `runPaymentConfirm` (same status-transition
  family as confirm/finalize, so it lives there rather than in the scanner).

Two Phase 1 gaps that carry forward unchanged into Phase 2 (not solved by
this pass, same as before): late payments detected after invoice expiry
aren't flagged (spec §46), and there's no generic `Idempotency-Key` header
handler yet (spec §52) — see `docs/security/THREAT_MODEL.md`'s "Deferred"
section.

## Webhook delivery pipeline

Unlike payment detection, this one *is* on `apps/worker` already, because
webhook state lives entirely in Postgres (`WebhookEvent`, `WebhookDelivery`)
— no in-memory adapter constraint applies.

```text
PaymentsService (apps/api)
  finalizePayment() / expireOverdueInvoices()
    → creates a WebhookEvent row (same DB transaction as the status change)

apps/worker: webhook-dispatch.queue.ts (poll every 2s)
    → WebhookEvent rows with no WebhookDelivery yet
    → fan out to every enabled WebhookEndpoint on the org
    → attempt delivery immediately (packages/webhooks: sign + SSRF-checked POST)
    → success: WebhookDelivery.status = SUCCEEDED
    → failure: status = FAILED, nextRetryAt = now + getRetryDelayMs(1)

apps/worker: webhook-retry.queue.ts (poll every 15s)
    → WebhookDelivery rows: status = FAILED AND nextRetryAt <= now
    → retry, increment attempt
    → success: SUCCEEDED
    → failure, schedule exhausted (getRetryDelayMs returns null past
      attempt 6): status = EXHAUSTED
    → failure, schedule remaining: status stays FAILED, new nextRetryAt
```

Retry delays follow spec §28's fixed table exactly (1m, 5m, 15m, 1h, 6h,
24h) with ±20% jitter layered on top (`packages/webhooks/retry-schedule.ts`)
— the spec calls this "exponential backoff with jitter" but then gives a
fixed table rather than a formula, so the table is authoritative and jitter
is applied around it rather than derived from it.

SSRF protection (`assertSafeWebhookUrl`) runs twice: once when the merchant
registers/edits the endpoint URL, and again on **every delivery attempt** —
DNS is attacker-controlled and can rebind between the two (a TOCTOU
otherwise). It rejects non-HTTPS URLs and any hostname resolving to a
loopback/RFC1918/link-local/cloud-metadata address; delivery itself never
follows redirects (`redirect: 'manual'`) and is timeout-bounded.

## Three authentication mechanisms, on purpose

The dashboard (browser, cookies), the Merchant API (server-to-server, Bearer
tokens), and the public checkout page (no identity at all) have different
threat models, so each uses its own guard stack rather than one unified
"auth" concept:

- **Dashboard sessions** — `SessionAuthGuard` verifies a short-lived JWT
  (HS256, 15 min) in an httpOnly `cp_at` cookie. Refresh happens via a
  separate opaque, rotated token (`cp_rt`, scoped to `/v1/auth`, 30 days).
  Reuse of an already-rotated refresh token is treated as theft and revokes
  the entire rotation family (`RefreshTokenService.rotate`) — see
  `docs/security/THREAT_MODEL.md`. Paired with `OrganizationScopeGuard` (see
  below) on every dashboard route. Used by `OrganizationsModule`,
  `ApiKeysModule`, and `DashboardModule`.
- **Merchant API keys** — `ApiKeyAuthGuard` validates
  `Authorization: Bearer cp_test_.../cp_live_...` by hashing the raw key
  with `HMAC-SHA256(API_KEY_PEPPER, raw)` and looking it up directly (no
  iteration needed, unlike per-key-salted schemes), then `ScopesGuard`
  checks the key was granted the specific scope a route requires
  (`@RequireScopes('invoices:write')` etc. — added in Phase 1; scopes were
  defined in Phase 0 but nothing enforced them until now). Used by
  `InvoicesModule`, `PaymentsModule`'s merchant-facing route, and
  `WebhooksModule`.
- **Public checkout — no auth at all, by design** — `CheckoutModule`'s
  routes (`GET /v1/checkout/:id`, `POST /v1/checkout/:id/simulate-payment`)
  take neither a session nor an API key (spec §19: a customer opening a
  payment link has neither). The invoice's own opaque public id *is* the
  access boundary here, not organization scoping — this is intentional, not
  a missed guard. Gated instead by a dedicated, more generous per-IP rate
  limit (`RateLimit('checkout')`, spec §30: 100/min/IP) since there's no
  other identity to key off of. The response is deliberately a narrower
  view (`CheckoutView`) than the authenticated `InvoiceView` — no
  `organizationId`, `externalId`, or `metadata` (spec §48).

Every session request also goes through `OrganizationScopeGuard`, which
resolves the caller's organization from an `X-Organization-Id` header (or
their sole membership) and re-verifies membership against the database on
**every request** — this is the core defense against BOLA (spec §12/§74):
a `userId` alone never implies access to a given organization's resources.
The merchant-API equivalent is simpler: `ApiKeyAuthGuard` sets
`request.organizationId` directly from the validated key's own row, so
there's no separate membership lookup needed there.

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
- `checkout` — IP only, `RATE_LIMIT_CHECKOUT_PER_MINUTE` (default 100/min) —
  `CheckoutModule`'s routes only, since they have no other identity to key
  a limit off of

All three are env-configurable rather than hardcoded, per spec §30. Invoice
creation itself (spec §30's other example: 60/min) has no dedicated limit
yet — it currently only gets the `global` bucket.

## Error format

Every API error is `{ error: { code, message, request_id, details? } }`
(spec §55). `packages/shared`'s `AppError` hierarchy
(`ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`,
`ConflictError`, `RateLimitedError`, `InternalError`,
`InvalidStateTransitionError` — Phase 1, thrown by `packages/payments`'
`assertInvoiceTransition`/`assertPaymentTransition`) maps to HTTP status
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
