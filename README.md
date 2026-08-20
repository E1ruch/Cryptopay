# CryptoPay

Non-custodial crypto payment infrastructure for online businesses — Stripe-like
checkout for stablecoins. See [`CryptoPay_Master_Spec.md`](CryptoPay_Master_Spec.md)
for the full product/engineering spec this project is built against.

**Status: Phase 0 — Architecture.** Auth, organizations, API keys, and the
merchant dashboard shell are implemented and tested. No blockchain
integration yet (that's Phase 1–2) — see [Roadmap](#roadmap) below.

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
  web/      Next.js dashboard + (future) checkout
  api/      NestJS API — auth, organizations, API keys
  worker/   BullMQ background jobs
packages/
  database/   Prisma schema + client
  config/     Env validation (Zod)
  crypto/     Password hashing, HMAC, API key generation, field encryption
  shared/     Error types, opaque ID generation, cross-cutting types
  validation/ Zod request schemas shared by api + web
  logger/     Structured logging with secret redaction
infrastructure/
  docker/     One-off Dockerfiles (e.g. migration runner)
  nginx/      Reverse proxy config
docs/
  architecture/   ARCHITECTURE.md, DATABASE.md
  security/       SECURITY.md, THREAT_MODEL.md, SECRETS.md
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

### First test payment flow (no blockchain yet — Phase 0)

1. `POST /v1/auth/register` with `{ email, password }`.
2. In dev mode there's no email provider yet — the verification token is
   logged by the API (`Verification token issued for ... : <token>`).
3. `POST /v1/auth/verify-email` with that token.
4. `POST /v1/auth/login` — sets session cookies.
5. Open the dashboard, create an organization, create an API key.

## Development

```bash
pnpm exec turbo run lint typecheck build   # everything, dependency-ordered
pnpm exec turbo run test:unit              # no external services required
pnpm exec turbo run test:integration       # needs postgres+redis running
```

Each package/app also exposes these as its own `pnpm run <script>`.

## Roadmap

See `CryptoPay_Master_Spec.md` §93 for the full phase breakdown. Short version:

- **Phase 0 (this)** — monorepo, auth, organizations, API keys, CI, Docker.
- **Phase 1** — Invoice/Payment domain, state machine, `FakeBlockchainAdapter`,
  webhook engine, checkout page.
- **Phase 2** — real EVM adapter on testnet (Base), block scanner, confirmations.
- **Phase 3** — production hardening (RPC failover, monitoring, backups).
- **Phase 4+** — pilot, then scale (more chains, payment links, SDKs).

## Docs

- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md)
- [`docs/architecture/DATABASE.md`](docs/architecture/DATABASE.md)
- [`docs/security/SECURITY.md`](docs/security/SECURITY.md)
- [`docs/security/THREAT_MODEL.md`](docs/security/THREAT_MODEL.md)
- [`docs/security/SECRETS.md`](docs/security/SECRETS.md)
