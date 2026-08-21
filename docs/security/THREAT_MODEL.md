# Threat model

Living document — updated every phase (spec §101). This revision covers
Phase 0 (auth core, organizations, API keys), Phase 1 (payment/webhook
engine, public checkout page, merchant dashboard), and Phase 2 (real Base
Sepolia adapter, merchant-supplied deposit addresses, worker-based
detection). RPC-provider-specific threats (a single compromised/malicious
RPC endpoint) are still deferred — Phase 2 talks to one public endpoint by
default with no failover or cross-checking, and that's explicitly Phase 3
scope (spec §38/§74), not this revision.

| Threat | Mitigation | Status |
|---|---|---|
| Attacker reads/modifies another organization's resources (BOLA) | `OrganizationScopeGuard` re-derives org from a live membership lookup on every request; every query filters by verified `organizationId`, never a bare client-supplied ID | Implemented, tested (`security.integration.test.ts`) |
| Attacker guesses/brute-forces another org's resource ID | Opaque cuid IDs; cross-org lookups return 404 (existence not leaked) rather than 403 | Implemented, tested |
| Credential stuffing / brute-force login | Argon2id, 5-attempt lockout (15 min), Redis rate limit (5/min per IP+email) | Implemented, tested |
| Stolen API key used from elsewhere | Keys are HMAC-hashed with a server-side pepper (`API_KEY_PEPPER`) never derivable from a DB dump alone; revocable; scoped to least privilege | Implemented; no anomaly/IP-based detection yet |
| Refresh token stolen and replayed | Rotation on every use; reuse of an already-rotated or expired token revokes the entire rotation family, forcing re-login | Implemented, tested |
| CSRF against a logged-in session | Double-submit `cp_csrf` cookie + `X-CSRF-Token` header, constant-time comparison | Implemented, tested |
| User enumeration via register/login timing or response shape | Register always returns the same generic response; login always returns "invalid email or password" for both nonexistent users and wrong passwords | Implemented |
| XSS reading httpOnly session cookies | `httpOnly` on `cp_at`/`cp_rt`; CSP baseline via `@fastify/helmet` on **API** responses | Partial — the checkout page now exists (`apps/web` `/pay/[id]`) and is exactly the surface that needed a real policy, but `apps/web` has no CSP of its own at all; the API's helmet CSP doesn't apply to it |
| Stolen/misused API key exceeds its granted privileges | `ScopesGuard` (Phase 1) checks `@RequireScopes(...)` against the key's own `scopes[]` on every merchant-API route (`invoices:write`, `webhooks:write`, etc.) | Implemented, tested — closes a gap noted in the Phase 0 revision of this doc (scopes were defined but nothing enforced them until now) |
| Anonymous checkout page abused for enumeration/DoS | No auth by design (spec §19 — a customer has neither session nor API key); gated by a dedicated per-IP rate limit (`RATE_LIMIT_CHECKOUT_PER_MINUTE`, default 100/min) instead; ids are opaque/high-entropy so there's no sequence to walk, and the response never includes another tenant's data | Implemented, tested (`checkout.integration.test.ts`) |
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
| Never trust customer-claimed payment success | Only the server-side detection pipeline (`PaymentsService` in `BLOCKCHAIN_MODE=fake`, or `apps/worker`'s blockchain-scan/payment-confirm queues in `evm` mode — never the frontend or a customer-submitted tx hash) can move an Invoice/Payment to a paid-adjacent state via the explicit state machines in `packages/payments`; invalid transitions throw rather than silently applying (spec §22/§88) | Implemented, tested |
| Server-side custody of merchant/customer funds or keys (spec §42) | The platform never generates or holds a deposit address's key — `MerchantWalletAddress` stores only a merchant-supplied public address, validated via the real adapter's `validateAddress()` before saving, reused across every invoice on that network/token. No keypair generation, no seed phrase, anywhere in the codebase | Implemented, tested |
| Wrong/spoofed token accepted as a real payment on-chain | `EvmBlockchainAdapter` identifies a token by `(chain, contract_address, decimals)` from a static registry (`packages/blockchain/token-registry.ts`), never by symbol alone (spec §23) — a same-symbol scam contract's transfers are never scanned since only the real USDC contract address is watched | Implemented |
| Blockchain reorg reverses a transaction already treated as confirming | `payment-confirm.queue.ts` moves a `CONFIRMING` payment to `REORG_DETECTED` (not straight to FAILED) the moment its transaction stops resolving, re-checks every tick, and only fails it after a 10-minute grace window with no sign of it reappearing (spec §25) | Implemented, tested — grace window/thresholds not yet load-tested against real Base Sepolia reorg depth |

## Deferred to later phases

- **CSP for `apps/web`** — the checkout page (the one page here an
  attacker-adjacent audience actually loads) renders with no
  Content-Security-Policy at all; the API's `@fastify/helmet` baseline
  doesn't reach it. Worth doing before checkout handles anything more
  sensitive than it does today.
- **RPC provider compromise/unreliability** (spec §38/§74) — Phase 2 talks
  to one public Base Sepolia endpoint (`BASE_SEPOLIA_RPC_URL`) with no
  failover, no cross-checking against a second provider, and no anomaly
  detection on the data it returns. Reorg handling (above) covers the chain
  itself changing its mind; it does nothing if the RPC endpoint itself lies
  or goes down. Phase 3's "RPC Provider Manager" is squarely this.
- **Concurrent-payment address-sharing ambiguity** — `MerchantWalletAddress`
  reuses one address across every invoice on a network/token (required by
  the custody-boundary decision above); `selectMatchingInvoice` resolves
  the common case by exact amount but doesn't disambiguate two invoices
  pending on the same address for the exact same amount at the same time.
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
or seed phrases in any phase without a separate security/legal review.

Phase 2 specifically chose **not** to implement generated per-invoice
deposit addresses (what `FakeBlockchainAdapter.generateDepositAddress()`
did in Phase 1) precisely because that pattern implies a key the platform
would have to hold — exactly what §42 gates behind a security review before
it can be added. Instead, `MerchantWalletAddress` stores a merchant-supplied
public address, reused across invoices; the platform never generates,
signs, or holds anything key-shaped. This is a deliberate, permanent design
choice for this project's threat model, not a placeholder waiting on that
review — a future generated-address feature (e.g. per-invoice HD-derived
addresses) would still need the review this section describes, and should
not be added by extending `BlockchainAdapter` without one.
