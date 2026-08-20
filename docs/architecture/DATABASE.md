# Database

PostgreSQL is the source of truth (spec §34) — Redis is only used for rate
limiting, BullMQ, and locks, never as a system of record. Schema lives in
[`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma).

## ERD — Phase 0

```text
User ──< Membership >── Organization
                              │
                              ├──< ApiKey (key_hash, key_prefix, scopes[])
                              ├──< AuditLog
                              └──< IdempotencyKey (unique: org_id + key)

User ──< RefreshToken            (rotated, familyId groups a rotation chain)
User ──< EmailVerificationToken  (single-use, 24h TTL)
```

Phase 1 adds `Invoice`, `Payment`, `PaymentAttempt`, `BlockchainNetwork`,
`Token`, `WebhookEndpoint`, `WebhookDelivery`, `DomainEvent` — see the Master
Spec §16–18 for those field lists; they aren't implemented yet.

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
  unique, which the integration test suite explicitly verifies.

## Indexes

Every foreign key used in a hot lookup path is indexed:
`organization_id` on `Membership`, `ApiKey`, `AuditLog`, `IdempotencyKey`;
`user_id` and `family_id` on `RefreshToken`; `created_at` on `AuditLog` for
time-ranged queries. Unique constraints double as indexes where they exist
(`User.email`, `Organization.slug`, `ApiKey.keyHash`,
`RefreshToken.tokenHash`, `Membership(userId, organizationId)`).

Partitioning, read replicas, and connection pooling are explicitly deferred
until metrics justify them (spec §71) — Phase 0 doesn't need them.

## Migrations

```bash
pnpm --filter @cryptopay/database prisma:migrate:dev    # local dev, creates a migration
pnpm --filter @cryptopay/database prisma:migrate:deploy # apply pending migrations (CI/prod)
pnpm --filter @cryptopay/database prisma:studio          # browse data
```

In Docker Compose, migrations run as a one-off `migrate` service before
`api`/`worker` start.
