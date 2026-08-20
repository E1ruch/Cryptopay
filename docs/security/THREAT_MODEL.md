# Threat model

Living document — updated every phase (spec §101). This revision covers
Phase 0 (auth core, organizations, API keys) plus Phase 1's payment and
webhook engine. Blockchain-specific threats (reorgs, RPC compromise — spec
§74) aren't relevant yet since Phase 1 only ever talks to
`FakeBlockchainAdapter`, not a real chain.

| Threat | Mitigation | Status |
|---|---|---|
| Attacker reads/modifies another organization's resources (BOLA) | `OrganizationScopeGuard` re-derives org from a live membership lookup on every request; every query filters by verified `organizationId`, never a bare client-supplied ID | Implemented, tested (`security.integration.test.ts`) |
| Attacker guesses/brute-forces another org's resource ID | Opaque cuid IDs; cross-org lookups return 404 (existence not leaked) rather than 403 | Implemented, tested |
| Credential stuffing / brute-force login | Argon2id, 5-attempt lockout (15 min), Redis rate limit (5/min per IP+email) | Implemented, tested |
| Stolen API key used from elsewhere | Keys are HMAC-hashed with a server-side pepper (`API_KEY_PEPPER`) never derivable from a DB dump alone; revocable; scoped to least privilege | Implemented; no anomaly/IP-based detection yet |
| Refresh token stolen and replayed | Rotation on every use; reuse of an already-rotated or expired token revokes the entire rotation family, forcing re-login | Implemented, tested |
| CSRF against a logged-in session | Double-submit `cp_csrf` cookie + `X-CSRF-Token` header, constant-time comparison | Implemented, tested |
| User enumeration via register/login timing or response shape | Register always returns the same generic response; login always returns "invalid email or password" for both nonexistent users and wrong passwords | Implemented |
| XSS reading httpOnly session cookies | `httpOnly` on `cp_at`/`cp_rt`; CSP baseline via `@fastify/helmet` | Partial — CSP is `default-src 'none'`, needs a real policy once the checkout page (Phase 1) renders untrusted-adjacent content |
| Secrets committed to git | `.env`/`.env.local` gitignored; `.env.example` ships no real values; CI uses fixed dummy values, never real secrets | Implemented |
| Secrets in logs | Field-name-based redaction (recursive) in `packages/logger`, unit-tested | Implemented |
| Mass account creation / spam | Global Redis rate limit (300/min/IP default); register also rate-limited (`RateLimit('global')` on the endpoint) | Implemented; no CAPTCHA/email-verification-cost yet |
| Unexpected server errors leaking internals | `AppExceptionFilter` maps every thrown value to a typed `AppError`; unhandled exceptions become a generic `InternalError` with no message/stack forwarded to the client | Implemented |
| Duplicate/conflicting concurrent writes | Unique DB constraints (`(organizationId, key)` on IdempotencyKey, `(userId, organizationId)` on Membership, `(organizationId, externalId)` on Invoice, `(network, txHash)` on Payment, `(eventId, endpointId)` on WebhookDelivery, etc.) rather than app-level checks alone | Implemented at the schema level; a generic `Idempotency-Key` request header (spec §52) beyond Invoice's own `external_id` boundary is still deferred |
| TOTP secret compromise via DB dump | AES-256-GCM encryption at rest (`ENCRYPTION_KEY`), not plaintext | Implemented |
| Weak/default secrets in production | `packages/config` enforces minimum lengths and correct formats (hex, etc.) at boot — the app fails to start rather than run with a malformed secret | Implemented |
| SSRF via merchant webhook URLs | `assertSafeWebhookUrl` (`packages/webhooks`) rejects non-HTTPS URLs and resolves the hostname, rejecting any address in a loopback/RFC1918/link-local/cloud-metadata range; re-checked on every delivery attempt (not just at registration) since DNS is attacker-controlled and can rebind between the two (TOCTOU); outgoing requests never follow redirects (`redirect: 'manual'`) and are timeout-bounded | Implemented, tested (`packages/webhooks` unit tests, `webhook-endpoints.integration.test.ts`) |
| Forged/replayed webhook deliveries accepted by a merchant | Every delivery is HMAC-SHA256 signed over `${timestamp}.${body}` with a per-endpoint secret (`X-CryptoPay-Signature`/`-Timestamp`/`-Event-ID` headers, spec §27/§61); reference `verifyWebhookSignature` also rejects a stale timestamp outside a tolerance window, giving merchants replay protection if they use it | Implemented, tested |
| Webhook signing secret compromise via DB dump | AES-256-GCM encryption at rest (`ENCRYPTION_KEY`), same as TOTP secrets — never stored or logged in plaintext | Implemented |
| Never trust customer-claimed payment success | Only the server-side detection pipeline (`PaymentsService`, polling `BlockchainAdapter`) can move an Invoice/Payment to a paid-adjacent state via the explicit state machines in `packages/payments`; invalid transitions throw rather than silently applying (spec §22/§88) | Implemented, tested |

## Deferred to later phases

- **Blockchain-specific threats** (reorgs, RPC provider compromise,
  wrong-token spoofing on a *real* chain) — spec §74, lands with Phase 2's
  real adapter. Phase 1's fake adapter has no such surface.
- **Generic `Idempotency-Key` request header handling** (spec §52) beyond
  the narrower `external_id`-based dedup Invoice creation already has.
- **Late payments detected after invoice expiry** (spec §46) — a transfer
  matched against an already-EXPIRED invoice is currently dropped rather
  than flagged for review; tracked separately.
- **Admin panel threats** (privilege escalation across `SUPER_ADMIN` /
  `ADMIN` / `SUPPORT` / etc.) — roles are defined in `packages/shared` but no
  admin endpoints exist yet.
- **Rate limiting beyond IP+email** (per-organization, per-API-key quotas —
  spec §30) — only IP/email-keyed limits exist today.
- **SAST/DAST, dependency-vuln gating as a hard CI failure** — Phase 4.

## Explicitly not attempted (by design, not oversight)

Per spec §3/§42, this project does not hold custody of funds, private keys,
or seed phrases in any phase without a separate security/legal review. There
is nothing to threat-model there yet because it doesn't exist in the
codebase.
