# CryptoPay

Non-custodial crypto payment infrastructure for online businesses — Stripe-like
checkout for stablecoins. See [`CryptoPay_Master_Spec.md`](CryptoPay_Master_Spec.md)
for the full product/engineering spec this project is built against.

**Status: Phase 1 complete — fake payments.** Auth, organizations, API keys,
the full Invoice/Payment domain, a fake blockchain adapter, webhook
delivery, the public checkout page, and the merchant dashboard are all
implemented and tested. There is still no *real* blockchain integration —
everything above runs against `FakeBlockchainAdapter`, a deterministic
in-memory stand-in. Phase 2 (real EVM adapter on testnet) is next — see
[Roadmap](#roadmap) below, and
[`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) for
exactly where that adapter plugs in.

## Stack

| Layer | Tech |
|---|---|
| Web | Next.js 16 (App Router), React 19, Tailwind v4, next-intl (RU/EN), TanStack Query |
| API | NestJS 11 + Fastify 5, Zod validation, OpenAPI/Swagger |
| Worker | BullMQ + ioredis |
| Database | PostgreSQL + Prisma |
| Infra | Docker Compose, nginx, Turborepo + pnpm workspaces |

## Repository layout

```text
apps/
  web/      Next.js dashboard + public checkout page (/pay/:id)
  api/      NestJS API — auth, organizations, API keys, invoices, payments,
            webhooks, checkout, dashboard reads
  worker/   BullMQ background jobs — health-check, webhook dispatch/retry
packages/
  database/   Prisma schema + client
  config/     Env validation (Zod)
  crypto/     Password hashing, HMAC, API key generation, field encryption
  shared/     Error types, opaque ID generation, cross-cutting types
  validation/ Zod request schemas shared by api + web
  logger/     Structured logging with secret redaction
  payments/   Invoice/Payment state machines, amount/matching rules — pure
              domain logic, no I/O (spec §87-88)
  blockchain/ BlockchainAdapter interface + FakeBlockchainAdapter (Phase 1) —
              the seam Phase 2's real EVM adapter plugs into
  webhooks/   HMAC signing, SSRF-safe URL validation, retry schedule,
              delivery — no BullMQ/Prisma, just the mechanics
infrastructure/
  docker/     One-off Dockerfiles (e.g. migration runner)
  nginx/      Reverse proxy config
docs/
  architecture/   ARCHITECTURE.md, DATABASE.md
  security/       SECURITY.md, THREAT_MODEL.md, SECRETS.md
  design/         TELEGRAM_STYLE_REDESIGN_PLAN.md
```

## Quickstart

### Option A — Docker Compose (closest to production)

```bash
cp .env.example .env
# fill in JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, SESSION_COOKIE_SECRET,
# CSRF_SECRET, API_KEY_PEPPER (openssl rand -hex 32) and ENCRYPTION_KEY
# (openssl rand -hex 32 — must be exactly 32 bytes / 64 hex chars)
docker compose up --build
```

`.env.example` also documents `REQUIRED_CONFIRMATIONS`,
`BLOCKCHAIN_BLOCK_TIME_MS` (Phase 1's fake chain — irrelevant once Phase 2's
real adapter replaces it) and `RATE_LIMIT_CHECKOUT_PER_MINUTE` — all have
working defaults, no action needed for local dev.

Visit `http://localhost` — nginx routes `/` to the web app and `/v1` to the API
on the same origin (no CORS needed in this setup).

### Option B — Local dev (hot reload)

```bash
pnpm install
docker compose up -d postgres redis   # local Postgres/Redis only
pnpm --filter @cryptopay/database prisma:migrate:dev
pnpm --filter @cryptopay/api dev &     # or: pnpm exec turbo run dev
pnpm --filter @cryptopay/worker dev &
pnpm --filter @cryptopay/web dev
```

The API listens on `API_PORT` (default `3010`), web on `3000`. Set
`apps/web/.env.local` from `.env.local.example` so the browser knows where
the API is.

### First test payment flow (spec §91: under 10 minutes, no real blockchain)

1. `POST /v1/auth/register` with `{ email, password }`.
2. In dev mode there's no email provider yet — the verification token is
   logged by the API (`Verification token issued for ... : <token>`).
3. `POST /v1/auth/verify-email` with that token.
4. `POST /v1/auth/login` — sets session cookies.
5. Open the dashboard (`/dashboard`), create an organization, then go to
   **API Keys** and create one (needs at least `invoices:write`).
6. Create an invoice with that key:
   ```bash
   curl -X POST http://localhost:3010/v1/invoices \
     -H "Authorization: Bearer cp_test_..." -H "Content-Type: application/json" \
     -d '{"amount":"49.00","currency":"USD","token":"USDC","network":"base"}'
   ```
   The response's `checkout_url` is a real page — open it in a browser.
7. Click **Simulate payment** on the checkout page (Phase 1 has no real
   wallet — this stands in for a customer's transfer, spec §58). The page
   polls automatically and moves through detecting → confirming → paid.
8. Check **Dashboard → Invoices** for the same invoice now showing `PAID`,
   and **Dashboard → Webhooks** (after registering an endpoint there) for
   the delivered `payment.paid` event.

## Development

```bash
pnpm exec turbo run lint typecheck build   # everything, dependency-ordered
pnpm exec turbo run test:unit              # no external services required
pnpm exec turbo run test:integration       # needs postgres+redis running
```

Each package/app also exposes these as its own `pnpm run <script>`.

## Roadmap

See `CryptoPay_Master_Spec.md` §93 for the full phase breakdown. Short version:

- **Phase 0** — monorepo, auth, organizations, API keys, CI, Docker. Done.
- **Phase 1 (this)** — done:
  - Invoice/Payment domain + explicit state machines (`packages/payments`)
  - `FakeBlockchainAdapter` (`packages/blockchain`) behind a `BlockchainAdapter`
    interface Phase 2 implements for real
  - Payment detection/confirmation pipeline (`apps/api/src/payments`) —
    currently an in-process poller, **not yet** on `apps/worker`'s
    already-scaffolded `blockchainScan`/`paymentConfirm` queues; see
    ARCHITECTURE.md for why and what Phase 2 needs to change
  - Webhook engine: HMAC signing, SSRF-safe delivery, retry schedule
    (`packages/webhooks`, `apps/worker`'s `webhookDispatch`/`webhookRetry`)
  - Public checkout page (`apps/web/src/app/pay/[id]`)
  - Merchant dashboard: invoices, API keys, webhook endpoints + delivery
    status (`apps/web/src/app/[locale]/dashboard`)
  - Two known gaps, intentionally deferred rather than silently skipped:
    late payments detected after invoice expiry aren't flagged (spec §46)
    and there's no generic `Idempotency-Key` header handler yet (spec §52,
    Invoice creation has its own narrower `external_id` dedup in the
    meantime) — see `docs/security/THREAT_MODEL.md`'s "Deferred" section.
- **Phase 2 (next)** — real EVM adapter on testnet (Base), block scanner,
  confirmations. Concretely: implement `BlockchainAdapter` for a real chain,
  swap `BlockchainModule`'s provider, and move the payment pipeline off its
  Phase-1 in-process poller onto `apps/worker`'s real queues — see
  ARCHITECTURE.md's "Blockchain adapter abstraction" section before touching
  any of this.
- **Phase 3** — production hardening (RPC failover, monitoring, backups).
- **Phase 4+** — pilot, then scale (more chains, payment links, SDKs).

## Docs

- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) —
  **read this first if you're starting Phase 2**
- [`docs/architecture/DATABASE.md`](docs/architecture/DATABASE.md)
- [`docs/security/SECURITY.md`](docs/security/SECURITY.md)
- [`docs/security/THREAT_MODEL.md`](docs/security/THREAT_MODEL.md)
- [`docs/security/SECRETS.md`](docs/security/SECRETS.md)
- [`docs/design/TELEGRAM_STYLE_REDESIGN_PLAN.md`](docs/design/TELEGRAM_STYLE_REDESIGN_PLAN.md) —
  design system the checkout page and dashboard both already use
