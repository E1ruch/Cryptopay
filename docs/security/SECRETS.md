# Secrets management

## Local development

Copy `.env.example` to `.env` and generate each secret yourself:

```bash
openssl rand -hex 32
```

Required: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_COOKIE_SECRET`,
`CSRF_SECRET`, `API_KEY_PEPPER`, `ENCRYPTION_KEY` (must decode to exactly 32
bytes — `openssl rand -hex 32` produces exactly that). `packages/config`
validates lengths/formats at boot and refuses to start on a malformed value.

`.env` and `.env.local` are gitignored. Never commit real secrets — if one
leaks, rotate it immediately (see below) rather than just removing it from
git history.

## CI

`.github/workflows/ci.yml` sets fixed, clearly-fake values
(`ci-test-jwt-access-secret-a...`) as workflow env vars — these satisfy
`packages/config`'s validation so the app can boot in tests, but they are
never used anywhere real and are safe to be public in the workflow file.

## Production

Real deployments must source secrets from a secrets manager (AWS Secrets
Manager, GCP Secret Manager, Azure Key Vault, or HashiCorp Vault), injected
as environment variables at container start — never baked into a Docker
image layer, never in a committed `.env` file. This isn't wired up yet
(Phase 0 has no production deployment target); it's a hard requirement
before Phase 4's production pilot.

## Rotation

- **JWT_ACCESS_SECRET / JWT_REFRESH_SECRET**: rotating invalidates all
  active sessions and refresh tokens immediately (no dual-secret grace
  period exists yet). Acceptable for Phase 0's scale; revisit before a real
  pilot if forced logout on rotation becomes disruptive.
- **API_KEY_PEPPER**: rotating invalidates every existing merchant API key
  (the stored hash can no longer be reproduced). Merchants would need to
  regenerate keys. Not yet a supported operational path — flag before any
  real merchant onboarding.
- **ENCRYPTION_KEY**: rotating breaks decryption of existing TOTP secrets.
  Users with 2FA enabled would need to re-enroll. Same caveat as above.

None of these rotation paths have a zero-downtime migration story yet —
that's explicitly deferred until it's needed (YAGNI), but is flagged here so
it isn't forgotten when planning a real production launch.
