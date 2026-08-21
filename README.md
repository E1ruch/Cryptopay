# CryptoPay

Non-custodial crypto payment infrastructure for online businesses — Stripe-like
checkout for stablecoins. See [`CryptoPay_Master_Spec.md`](CryptoPay_Master_Spec.md)
for the full product/engineering spec this project is built against.

**Status: Phase 2 complete — real testnet payments.** Auth, organizations,
API keys, the full Invoice/Payment domain, webhook delivery, the public
checkout page, and the merchant dashboard are all implemented and tested.
A real EVM adapter (Base Sepolia, via `viem`) now runs alongside Phase 1's
`FakeBlockchainAdapter` — pick which with `BLOCKCHAIN_MODE=fake` (default,
zero setup) or `BLOCKCHAIN_MODE=evm` (real testnet USDC, see
[Roadmap](#roadmap) below). See
[`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) for
how the two modes fit together.

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
  worker/   BullMQ background jobs — health-check, webhook dispatch/retry,
            blockchain scan + payment confirm (BLOCKCHAIN_MODE=evm only)
packages/
  database/   Prisma schema + client
  config/     Env validation (Zod)
  crypto/     Password hashing, HMAC, API key generation, field encryption
  shared/     Error types, opaque ID generation, cross-cutting types
  validation/ Zod request schemas shared by api + web
  logger/     Structured logging with secret redaction
  payments/   Invoice/Payment state machines, amount/matching rules — pure
              domain logic, no I/O (spec §87-88)
  blockchain/ BlockchainAdapter interface, FakeBlockchainAdapter (Phase 1),
              EvmBlockchainAdapter (Phase 2 — Base Sepolia via viem), and
              the per-network adapter registry
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

`.env.example` also documents `BLOCKCHAIN_MODE` (`fake` by default —
zero-setup, in-memory chain; set to `evm` for real Base Sepolia testnet
payments), `REQUIRED_CONFIRMATIONS`, `BLOCKCHAIN_BLOCK_TIME_MS` (fake mode
only), `BASE_SEPOLIA_RPC_URL` (evm mode only — defaults to the public
`sepolia.base.org` endpoint), and `RATE_LIMIT_CHECKOUT_PER_MINUTE` — all
have working defaults, no action needed for local dev in fake mode.

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

### First test payment flow (spec §91: under 10 minutes, `BLOCKCHAIN_MODE=fake`)

1. `POST /v1/auth/register` with `{ email, password }`.
2. In dev mode there's no email provider yet — the verification token is
   logged by the API (`Verification token issued for ... : <token>`).
3. `POST /v1/auth/verify-email` with that token.
4. `POST /v1/auth/login` — sets session cookies.
5. Open the dashboard (`/dashboard`), create an organization, then go to
   **API Keys** and create one (needs at least `invoices:write`). (In fake
   mode you can skip straight to step 6 — a deposit address is
   auto-provisioned; in evm mode, set one first under **Settings → Wallet
   address**, see below.)
6. Create an invoice with that key:
   ```bash
   curl -X POST http://localhost:3010/v1/invoices \
     -H "Authorization: Bearer cp_test_..." -H "Content-Type: application/json" \
     -d '{"amount":"49.00","currency":"USD","token":"USDC","network":"base"}'
   ```
   The response's `checkout_url` is a real page — open it in a browser.
7. Click **Simulate payment** on the checkout page (fake mode has no real
   wallet — this stands in for a customer's transfer, spec §58; disabled in
   evm mode). The page polls automatically and moves through detecting →
   confirming → paid.
8. Check **Dashboard → Invoices** for the same invoice now showing `PAID`,
   and **Dashboard → Webhooks** (after registering an endpoint there) for
   the delivered `payment.paid` event.

### Real testnet payment flow (`BLOCKCHAIN_MODE=evm`)

Set `BLOCKCHAIN_MODE=evm` (and optionally a paid `BASE_SEPOLIA_RPC_URL`) and
run `apps/worker` alongside `apps/api` — the blockchain-scan/payment-confirm
queues only start in this mode. Then:

1. Steps 1–5 above, same as fake mode.
2. In the dashboard, go to **Settings → Wallet address** and enter a Base
   address you control (public address only — CryptoPay never asks for or
   stores a key). Invoice creation fails with a clear error until this is set.
3. Create an invoice (same `curl` as above) and open its `checkout_url`.
4. Send real Base Sepolia testnet USDC from a funded wallet to the address
   shown on the checkout page.
5. `apps/worker` detects the transfer, tracks confirmations
   (`REQUIRED_CONFIRMATIONS`, default 3), and finalizes the invoice —
   watch it move `DETECTED → CONFIRMING → PAID` on **Dashboard → Invoices**,
   same as the simulated flow, just driven by a real chain this time.

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
- **Phase 1** — done:
  - Invoice/Payment domain + explicit state machines (`packages/payments`)
  - `FakeBlockchainAdapter` (`packages/blockchain`) behind a `BlockchainAdapter`
    interface
  - Webhook engine: HMAC signing, SSRF-safe delivery, retry schedule
    (`packages/webhooks`, `apps/worker`'s `webhookDispatch`/`webhookRetry`)
  - Public checkout page (`apps/web/src/app/pay/[id]`)
  - Merchant dashboard: invoices, API keys, webhook endpoints + delivery
    status (`apps/web/src/app/[locale]/dashboard`)
- **Phase 2 (this)** — done:
  - `EvmBlockchainAdapter` (`packages/blockchain`, via `viem`) for Base
    Sepolia testnet, behind the same `BlockchainAdapter` interface, selected
    per-network by a small adapter registry (`BLOCKCHAIN_MODE=fake|evm`)
  - Merchant-supplied deposit addresses (`MerchantWalletAddress`, dashboard
    **Settings → Wallet address**) replacing Phase 1's generated-per-invoice
    address — spec §42 forbids the platform holding a key for that; see
    `docs/security/THREAT_MODEL.md`'s "Explicitly not attempted" section
  - Payment detection/confirmation moved onto `apps/worker`'s
    `blockchainScan`/`paymentConfirm` queues in `evm` mode (still an
    in-process `apps/api` poller in `fake` mode — see ARCHITECTURE.md for why
    both exist)
  - Reorg handling (spec §25): a confirming payment whose transaction
    disappears moves to `REORG_DETECTED` and gets a grace window to
    reappear before failing, rather than assuming finality too early
  - Known gaps carried forward unchanged from Phase 1 (not addressed by
    this pass): late payments after invoice expiry aren't flagged (spec
    §46), no generic `Idempotency-Key` header handler (spec §52), and
    two invoices pending on the same shared address for the exact same
    amount at once aren't disambiguated — see
    `docs/security/THREAT_MODEL.md`'s "Deferred" section.
- **Phase 3 (next)** — production hardening: RPC failover/provider manager
  (spec §38 — Phase 2 talks to a single public RPC endpoint with no
  fallback), monitoring, backups, rate limiting beyond IP/email.
- **Phase 4+** — pilot, then scale (more chains, payment links, SDKs).

## Docs

- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) —
  **read this first if you're starting Phase 3**
- [`docs/architecture/DATABASE.md`](docs/architecture/DATABASE.md)
- [`docs/security/SECURITY.md`](docs/security/SECURITY.md)
- [`docs/security/THREAT_MODEL.md`](docs/security/THREAT_MODEL.md)
- [`docs/security/SECRETS.md`](docs/security/SECRETS.md)
- [`docs/design/TELEGRAM_STYLE_REDESIGN_PLAN.md`](docs/design/TELEGRAM_STYLE_REDESIGN_PLAN.md) —
  design system the checkout page and dashboard both already use
