# Database

PostgreSQL is the source of truth (spec §34) — Redis is only used for rate
limiting, BullMQ, and locks, never as a system of record. Schema lives in
[`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma).

## ERD — Phase 0 + Phase 1 + Phase 2

```text
User ──< Membership >── Organization
                              │
                              ├──< ApiKey (key_hash, key_prefix, scopes[])
                              ├──< AuditLog
                              ├──< IdempotencyKey (unique: org_id + key —
                              │      table exists, unused so far; see below)
                              ├──< MerchantWalletAddress (unique: org_id +
                              │      network + token — merchant-supplied
                              │      receiving address, spec §42; Phase 2)
                              ├──< Invoice (unique: org_id + external_id)
                              │      │  status: CREATED..REFUNDED (11 states,
                              │      │  packages/payments owns the transition map)
                              │      ├──< Payment (unique: network + tx_hash)
                              │      │      one row per blockchain-detected
                              │      │      attempt — an invoice can have several
                              │      └──< WebhookEvent
                              │             (payment.paid / .underpaid / .overpaid,
                              │              invoice.expired)
                              ├──< WebhookEndpoint (secret_enc, AES-256-GCM)
                              │      └──< WebhookDelivery
                              └──< WebhookEvent >── WebhookDelivery
                                     (WebhookDelivery: unique event_id + endpoint_id
                                      — one delivery row per (event, endpoint) pair,
                                      fanned out to every enabled endpoint on the org)

User ──< RefreshToken            (rotated, familyId groups a rotation chain)
User ──< EmailVerificationToken  (single-use, 24h TTL)

BlockchainScanCursor (network PK — no organization; one row per network,
                       Phase 2's durable "how far has the worker scanned")
```

Phase 1 shipped a simpler model than the Master Spec's §11 domain-entity
list suggested (`BlockchainNetwork`, `Token`, `DepositAddress`,
`BlockchainTransaction` as separate tables) — `Invoice.network`/`.token`
stayed plain strings through Phase 2 as well (a static config object in
`packages/blockchain/token-registry.ts` covers contract address/decimals
per network+token, which was enough once there was a second, real
network's worth of config to hold — no `BlockchainNetwork`/`Token` tables
needed yet). What Phase 1 didn't have and Phase 2 added: `Invoice.paymentAddress`
is no longer a one-off generated value unique to that invoice — see
`MerchantWalletAddress` below — and `BlockchainScanCursor`, the durable
version of what used to be an in-process `lastScannedBlock` field.

## Multi-tenancy

Every merchant-owned table carries `organization_id`, indexed. No endpoint
ever trusts a bare resource ID to imply ownership — `OrganizationScopeGuard`
resolves the caller's `organizationId` from a verified membership, and every
query filters by it explicitly (see e.g. `ApiKeysService.revoke`, which does
`findFirst({ where: { id, organizationId } })` rather than `findUnique({ id
})` — a key from another organization simply doesn't match, returning 404
rather than leaking existence).

## Table notes

- **User** — `passwordHash` is Argon2id. `twoFactorSecretEnc` is
  AES-256-GCM ciphertext (`ENCRYPTION_KEY`), never plaintext — spec §41.
  `failedLoginAttempts`/`lockedUntil` implement time-boxed account lockout;
  `lockedUntil` expiring is enough to allow a retry even if `status` is
  still stale `LOCKED` (normalized back to `ACTIVE` on the next successful
  login).
- **RefreshToken** — `tokenHash` is `HMAC-SHA256(JWT_REFRESH_SECRET:refresh,
  raw)`, never the raw token. `familyId` groups a rotation chain;
  `replacedById` links a token to whatever superseded it. Reuse of a
  `revokedAt`-set token revokes the whole family (theft detection).
- **EmailVerificationToken** — same HMAC-hash approach, domain-separated
  from refresh tokens via an HMAC key suffix (`:email_verification`) so the
  two hash spaces can never collide even though they share a base secret.
- **ApiKey** — `keyHash` is `HMAC-SHA256(API_KEY_PEPPER, raw)`; the raw key
  (`cp_test_.../cp_live_...`) is shown exactly once at creation and never
  stored. `keyPrefix` (first 12 chars) is safe to display for identification.
  `scopes` is a plain `String[]` — see spec §75 for the scope vocabulary.
- **AuditLog** — append-only from the application's perspective (no update
  path exists in the codebase). `actorId` is a plain string, not a foreign
  key — the actor can be a user, an API key, an admin, or `system`, and a
  polymorphic FK isn't worth the complexity for a log table.
- **IdempotencyKey** — unique on `(organization_id, key)`. Two different
  organizations may reuse the same key value; only the org+key pair must be
  unique, which the integration test suite explicitly verifies. **Still
  unused by application code** as of Phase 1 (only the test db-cleanup
  helper touches it) — a generic `Idempotency-Key` request-header handler
  (spec §52) is a known, deliberately deferred gap; see
  `docs/security/THREAT_MODEL.md`. `Invoice` has its own narrower dedup in
  the meantime, below.
- **MerchantWalletAddress** — Phase 2. The merchant's own receiving address
  for a `(network, token)` pair, unique on `(organizationId, network,
  token)`. `InvoicesService.create()` reads it to populate
  `Invoice.paymentAddress`, reused across every invoice on that
  network/token — not generated by the platform, not unique per invoice
  (spec §42: no server-held keys). See ARCHITECTURE.md's "Blockchain
  adapter abstraction" section for why this replaced Phase 1's
  per-invoice-generated address.
- **BlockchainScanCursor** — Phase 2. One row per network, `network` as the
  primary key (no `organizationId` — this is infrastructure state, not
  merchant data). `lastScannedBlock` defaults to `-1` ("nothing scanned
  yet"; a plain `0` default would wrongly mean "block 0 already scanned").
  Read and advanced once per tick by `apps/worker`'s blockchain-scan queue
  — replaces what was an in-process field on a NestJS singleton in Phase 1,
  since a worker process has no durable in-memory state across restarts.
- **Invoice** — `amount` is `Decimal(20,8)`, never a float (spec §18).
  `paymentAddress` is **no longer globally unique** as of Phase 2 (it was in
  Phase 1) — it's the organization's `MerchantWalletAddress` for the
  invoice's network/token, which can be shared by several PENDING invoices
  at once. The scanner narrows candidates via `matchesInvoice`
  (network+token+address) and then disambiguates with
  `selectMatchingInvoice` (prefer an exact amount match, else oldest
  pending — see ARCHITECTURE.md); indexed on `(paymentAddress, status)`
  instead of a unique constraint. `status` is constrained to the
  11-value `InvoiceStatus` enum, but the enum only bounds legal *values*;
  legal *transitions* are enforced by `packages/payments` in application
  code, never by the database (spec §88 — no direct mutation without domain
  validation). Unique on `(organizationId, externalId)` — spec §26/§52's
  narrower idempotency boundary: retrying invoice creation with the same
  merchant-supplied `external_id` and matching params returns the original
  invoice rather than erroring or duplicating.
- **Payment** — one row per blockchain-detected attempt, not one row per
  invoice (spec §17 — an invoice can accumulate several attempts).
  `expectedAmount`/`receivedAmount` are both `Decimal`; comparing them
  (`packages/payments`' `evaluatePaymentAmount`) is what decides
  exact/underpaid/overpaid, never mere arrival of *a* transfer. Unique on
  `(network, txHash)` — spec §26's idempotency boundary for blockchain
  event processing; `txHash` is nullable pre-detection, and Postgres
  treats multiple `NULL`s in a unique index as distinct, which is the
  correct behavior here (each is a separate pending attempt).
- **WebhookEndpoint** — `secretEnc` is AES-256-GCM ciphertext
  (`ENCRYPTION_KEY` — the same key used for TOTP secrets; rotating it
  breaks both), not a hash, because delivery needs the plaintext secret
  back to compute each outgoing HMAC signature. Soft-deleted via
  `enabled: false` + `revokedAt`, never hard-deleted (delivery history
  should stay attributable).
- **WebhookEvent** — `data` is a `Json` column holding the exact payload
  shape sent to merchants (spec §27: `invoice_id`, `external_id`, `amount`,
  `currency`, `network`, `status`, `tx_hash`). Created in the same Prisma
  `$transaction` as the Invoice/Payment status change that triggered it, so
  a crash can never change status without also recording the event (or
  vice versa).
- **WebhookDelivery** — one row per `(event, endpoint)` pair, unique on
  exactly that — guards against `apps/worker`'s dispatch scanner
  double-creating a delivery if two poll ticks ever overlap. `attempt`
  starts at 1; `status` moves `PENDING → SUCCEEDED` or
  `PENDING → FAILED → FAILED → ... → EXHAUSTED` as
  `packages/webhooks`' retry schedule plays out (spec §28).

## Indexes

Every foreign key used in a hot lookup path is indexed:
`organization_id` on `Membership`, `ApiKey`, `AuditLog`, `IdempotencyKey`,
`Invoice`, `Payment`, `WebhookEndpoint`, `WebhookEvent`; `user_id` and
`family_id` on `RefreshToken`; `created_at` on `AuditLog` for time-ranged
queries; `invoiceId` on `Payment` and `WebhookEvent`; `eventId`/`endpointId`
on `WebhookDelivery`; a compound `(status, nextRetryAt)` on `WebhookDelivery`
for the retry-queue scanner's exact query shape; `status` on `Invoice` (the
payment-detection pipeline scans `WHERE status = 'PENDING'` etc. every
tick); a compound `(paymentAddress, status)` on `Invoice` (Phase 2 — the
scanner's candidate lookup for a shared merchant address, see above).
Unique constraints double as indexes where they exist (`User.email`,
`Organization.slug`, `ApiKey.keyHash`, `RefreshToken.tokenHash`,
`Membership(userId, organizationId)`,
`MerchantWalletAddress(organizationId, network, token)`,
`Invoice(organizationId, externalId)`, `Payment(network, txHash)`,
`WebhookDelivery(eventId, endpointId)`).

Partitioning, read replicas, and connection pooling are explicitly deferred
until metrics justify them (spec §71) — not needed at Phase 1's scale.

## Migrations

```bash
pnpm --filter @cryptopay/database prisma:migrate:dev    # local dev, creates a migration
pnpm --filter @cryptopay/database prisma:migrate:deploy # apply pending migrations (CI/prod)
pnpm --filter @cryptopay/database prisma:studio          # browse data
```

In Docker Compose, migrations run as a one-off `migrate` service before
`api`/`worker` start.
