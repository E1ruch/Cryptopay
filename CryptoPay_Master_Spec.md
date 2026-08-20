# CryptoPay — техническое задание и Master Prompt для AI-разработчика

## 1. Роль AI-разработчика

Ты являешься **Senior Staff Software Engineer, Backend Architect, Security Engineer и DevOps Engineer**.

Твоя задача — спроектировать и реализовать production-grade SaaS-платформу для приёма криптовалютных платежей бизнесами.

Проект должен быть:

- масштабируемым;
- безопасным;
- отказоустойчивым;
- наблюдаемым;
- тестируемым;
- API-first;
- пригодным для дальнейшего перехода к нескольким blockchain networks;
- пригодным для работы с большим количеством merchants и payments.

Не создавай игрушечный demo-проект.

При этом не переусложняй MVP микросервисами без необходимости.

Архитектура должна позволять постепенно разделять компоненты по мере роста нагрузки.

---

# 2. Название проекта

Рабочее название:

**CryptoPay**

Назначение:

> Crypto payment infrastructure for online businesses.

Основная идея:

Бизнес регистрируется в CryptoPay, создаёт invoice через Dashboard или API, получает checkout URL и принимает оплату в поддерживаемых stablecoins.

CryptoPay обнаруживает on-chain transaction, проверяет её, связывает её с invoice и отправляет merchant webhook.

---

# 3. Главный принцип MVP

## НЕ строить собственную биржу.

## НЕ хранить пользовательские средства.

## НЕ создавать custodial wallet для merchant.

## НЕ реализовывать crypto exchange.

## НЕ реализовывать fiat settlement.

## НЕ реализовывать автоматический crypto → fiat exchange.

MVP должен быть максимально близок к:

> **Non-custodial crypto payment processor / payment orchestration layer.**

Фактическая юридическая квалификация модели должна быть проверена юристом до запуска реальных платежей.

---

# 4. MVP

Первая версия должна поддерживать:

### Merchant

- регистрация;
- login;
- email verification;
- 2FA;
- merchant profile;
- API keys;
- webhook endpoints;
- webhook secrets;
- dashboard;
- transaction history;
- invoice history;
- payment links;
- basic analytics.

### Customer

Customer не обязан регистрироваться.

Flow:

```text
Merchant
   ↓
Create Invoice
   ↓
CryptoPay generates Checkout
   ↓
Customer opens Checkout
   ↓
Customer chooses network/token
   ↓
Customer pays
   ↓
Blockchain transaction detected
   ↓
Transaction verification
   ↓
Confirmations
   ↓
Invoice = PAID
   ↓
Webhook → Merchant
```

---

# 5. MVP blockchain strategy

Не поддерживать сразу 10 blockchain networks.

Начать с:

## USDC

и одной EVM-compatible network, выбранной отдельно после оценки:

- fees;
- RPC reliability;
- ecosystem;
- wallet support;
- transaction speed;
- regulatory/business suitability.

Архитектура blockchain layer должна быть abstraction-first, чтобы позже добавить:

```text
Ethereum
Base
Polygon
Solana
Tron
Bitcoin
```

без переписывания Payment Core.

---

# 6. Product architecture

Основные компоненты:

```text
                    ┌─────────────────────┐
                    │      Web App        │
                    │   Merchant/Admin    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │      API Layer      │
                    │    REST / HTTPS     │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       Auth / Users      Payment Core      Merchant API
              │                │                │
              └────────────────┼────────────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
                  ▼                         ▼
              PostgreSQL                  Redis
                  │                         │
                  │                         ▼
                  │                  Background Jobs
                  │                         │
                  │             ┌───────────┴───────────┐
                  │             │                       │
                  ▼             ▼                       ▼
             Ledger         Blockchain              Webhooks
                            Indexers
                                │
                                ▼
                         Blockchain RPC
```

---

# 7. Recommended stack

## Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Zod

UI style:

- minimal;
- professional;
- Stripe-like;
- Apple-like clarity;
- no crypto casino aesthetic.

---

# 8. Backend

Use:

- Node.js
- TypeScript
- NestJS OR Fastify-based modular architecture
- PostgreSQL
- Prisma or Drizzle
- Redis
- BullMQ
- OpenAPI
- Zod/class-validator
- Pino logging

Prefer:

**NestJS + Fastify**

for initial implementation if it does not create unnecessary complexity.

---

# 9. Infrastructure

Initial:

```text
Docker
Docker Compose
PostgreSQL
Redis
API
Worker
Web
Nginx / reverse proxy
```

Production-ready architecture must support:

```text
Cloud Load Balancer
        ↓
API replicas
        ↓
PostgreSQL
        ↓
Redis
        ↓
Worker replicas
```

Do not make the application dependent on local filesystem state.

All persistent state belongs in PostgreSQL or external object storage.

---

# 10. Repository structure

Use a monorepo.

Recommended:

```text
cryptopay/
│
├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   └── docs/
│
├── packages/
│   ├── database/
│   ├── config/
│   ├── crypto/
│   ├── blockchain/
│   ├── payments/
│   ├── webhooks/
│   ├── validation/
│   ├── logger/
│   └── shared/
│
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── terraform/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── security/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── security/
│   └── operations/
│
├── docker-compose.yml
├── package.json
└── README.md
```

---

# 11. Domain model

Core entities:

```text
User
Organization
Membership
Merchant
ApiKey
WebhookEndpoint
Invoice
Payment
PaymentAttempt
BlockchainNetwork
Token
DepositAddress
BlockchainTransaction
WebhookDelivery
AuditLog
IdempotencyKey
```

---

# 12. Multi-tenant architecture

The system must be multi-tenant from day one.

Every merchant-owned resource must contain:

```text
organization_id
```

Never trust:

```text
GET /invoices/:id
```

to imply that the authenticated user owns the invoice.

Every object lookup must verify:

```text
resource.organization_id === authenticated.organization_id
```

or equivalent authorization policy.

---

# 13. Users

User fields:

```text
id
email
password_hash
status
email_verified_at
two_factor_enabled
created_at
updated_at
last_login_at
```

Never store plaintext passwords.

Use:

- Argon2id;
- secure session/token mechanism;
- refresh token rotation;
- secure cookies where applicable.

---

# 14. Organizations

Fields:

```text
id
name
slug
status
created_at
updated_at
```

Possible future statuses:

```text
ACTIVE
SUSPENDED
PENDING_REVIEW
CLOSED
```

---

# 15. API keys

Never store raw API keys.

Store:

```text
id
organization_id
name
key_prefix
key_hash
last_used_at
expires_at
revoked_at
created_at
```

Show raw secret only once.

Example:

```text
cp_live_xxxxxxxxxxxxxxxxx
```

Separate environments:

```text
cp_test_
cp_live_
```

Test and production credentials must never be interchangeable.

---

# 16. Invoice

Invoice fields:

```text
id
organization_id
external_id
status
amount
currency
token
network
payment_address
expires_at
success_url
cancel_url
metadata
created_at
updated_at
```

Statuses:

```text
CREATED
PENDING
DETECTED
CONFIRMING
PAID
UNDERPAID
OVERPAID
EXPIRED
FAILED
CANCELLED
REFUNDED
```

Never allow arbitrary status transitions.

Use a state machine.

Example:

```text
CREATED
   ↓
PENDING
   ↓
DETECTED
   ↓
CONFIRMING
   ↓
PAID
```

---

# 17. Payment model

A Payment is not the same thing as an Invoice.

One invoice can theoretically have multiple payment attempts.

Example:

```text
Invoice
 ├── Payment Attempt #1
 ├── Payment Attempt #2
 └── Payment Attempt #3
```

Payment fields:

```text
id
invoice_id
organization_id
network
token
expected_amount
received_amount
tx_hash
from_address
to_address
block_number
confirmations
status
detected_at
confirmed_at
created_at
updated_at
```

---

# 18. Monetary values

NEVER use JavaScript floating-point numbers for money.

Bad:

```text
amount = 0.1 + 0.2
```

Use:

- integer base units for blockchain amounts;
- DECIMAL/NUMERIC for fiat/accounting values;
- explicit precision;
- arbitrary precision libraries when required.

Example:

```text
USDC:
1000000 = 1.000000 USDC
```

Never use:

```text
float
double
number
```

for monetary calculations.

---

# 19. Checkout

Public URL:

```text
/pay/:invoice_public_id
```

Checkout must show:

```text
Merchant name

Amount:
$49.00

Pay with:
USDC

Network:
Base

Wallet:
[Connect Wallet]

OR

Send manually

[QR CODE]

Address:
0x...

Amount:
49.00 USDC

Expires:
09:42
```

Never expose internal database IDs.

Use opaque public IDs.

---

# 20. Payment detection

Blockchain integration must be isolated behind an interface.

Example:

```typescript
interface BlockchainAdapter {
  getLatestBlock(): Promise<BlockNumber>;

  getTransaction(txHash: string): Promise<Transaction | null>;

  getTokenTransfers(
    blockNumber: number
  ): Promise<TokenTransfer[]>;

  getConfirmations(
    txHash: string
  ): Promise<number>;

  validateAddress(
    address: string
  ): boolean;
}
```

Payment Core must not know how Ethereum, Base, Polygon or Solana internally work.

---

# 21. Blockchain listener

Worker architecture:

```text
Blockchain RPC
      ↓
Block Scanner
      ↓
Transfer Decoder
      ↓
Address Matcher
      ↓
Payment Matcher
      ↓
Payment Verification
      ↓
Confirmation Worker
```

Do not rely solely on frontend polling.

The server is the source of truth.

---

# 22. Never trust the customer

Customer may submit:

```text
tx_hash
```

but this is only a hint.

Never mark:

```text
PAID
```

based on:

```text
customer says they paid
```

or:

```text
frontend says transaction succeeded
```

Only the backend blockchain verification process can change payment state.

---

# 23. Transaction verification

For every detected payment verify:

```text
network
token contract
destination address
transaction status
amount
block
confirmations
invoice expiration
```

For token payments verify the exact token contract address.

Never identify a token only by:

```text
symbol = "USDC"
```

because symbols can be spoofed.

Use:

```text
chain_id
contract_address
decimals
```

as the canonical identity.

---

# 24. Confirmation policy

Each network must have configurable confirmation policy.

Example:

```text
required_confirmations
```

Do not hardcode confirmation assumptions throughout the application.

Example:

```text
Payment:
DETECTED

0 confirmations

↓

CONFIRMING

↓

N confirmations

↓

PAID
```

---

# 25. Reorg protection

Blockchain reorganizations must be considered.

A payment should not be considered irreversible merely because it appeared in a block.

The system must support:

```text
CONFIRMING
```

and only transition to:

```text
PAID
```

after the configured confirmation threshold.

If a previously detected transaction disappears due to reorg:

```text
REORG_DETECTED
```

and the payment must be re-evaluated.

---

# 26. Idempotency

Every important operation must be idempotent.

Especially:

```text
invoice creation
payment processing
block processing
transaction processing
webhook delivery
refund processing
```

Use unique constraints such as:

```text
(network, tx_hash)
```

and:

```text
organization_id + external_id
```

where appropriate.

---

# 27. Webhooks

Merchant webhook example:

```http
POST https://merchant.com/api/cryptopay/webhook
```

Payload:

```json
{
  "id": "evt_xxxxx",
  "type": "payment.paid",
  "created": 1780000000,
  "data": {
    "invoice_id": "inv_xxxxx",
    "external_id": "order_123",
    "amount": "49.00",
    "currency": "USDC",
    "network": "base",
    "status": "paid",
    "tx_hash": "0x..."
  }
}
```

Sign every webhook.

Example:

```text
X-CryptoPay-Signature
X-CryptoPay-Timestamp
X-CryptoPay-Event-ID
```

Signature:

```text
HMAC-SHA256
```

Merchant can verify authenticity.

---

# 28. Webhook retry system

Never assume merchant endpoint is always online.

Retry:

```text
1 min
5 min
15 min
1 hour
6 hours
24 hours
```

Use exponential backoff with jitter.

Store every attempt:

```text
WebhookDelivery
```

Fields:

```text
id
event_id
endpoint_id
attempt
status_code
response_time
error
next_retry_at
delivered_at
created_at
```

Merchant dashboard must show delivery status.

---

# 29. Webhook security

Merchant webhook URLs are untrusted external endpoints.

Validate:

- URL format;
- HTTPS;
- redirect behavior;
- timeout;
- response size;
- DNS resolution where appropriate;
- SSRF protection.

Never allow the worker to blindly request arbitrary internal URLs.

---

# 30. API rate limiting

Implement rate limiting at multiple levels:

```text
IP
user
organization
API key
endpoint
```

Example:

```text
Login:
5 requests/minute

Invoice creation:
60/minute

Public checkout:
100/minute/IP
```

Limits must be configurable.

---

# 31. Authentication security

Implement:

- password hashing with Argon2id;
- email verification;
- login rate limiting;
- account lockout/risk controls;
- 2FA/TOTP;
- session expiration;
- refresh-token rotation;
- logout/revocation;
- CSRF protection where cookies are used;
- secure cookies;
- SameSite;
- HTTPS only.

Never put secrets into URLs.

---

# 32. Admin panel

Admin panel must be completely separated logically from merchant dashboard.

Roles:

```text
SUPER_ADMIN
ADMIN
SUPPORT
FINANCE
SECURITY
READ_ONLY
```

Every privileged action must be audited.

---

# 33. Audit log

Audit log:

```text
id
organization_id
actor_id
actor_type
action
resource_type
resource_id
ip
user_agent
metadata
created_at
```

Audit logs should be append-only from the application perspective.

---

# 34. Database principles

Use PostgreSQL.

Required:

- foreign keys;
- unique constraints;
- indexes;
- transactions;
- optimistic/concurrency controls where required;
- database migrations;
- soft deletion only where appropriate.

Do not solve consistency problems with Redis.

PostgreSQL is the source of truth.

Redis is a performance and job-processing layer.

---

# 35. Redis

Use Redis for:

- rate limiting;
- BullMQ queues;
- temporary locks;
- caching;
- short-lived sessions if needed.

Never store the canonical payment balance only in Redis.

---

# 36. Queues

Create queues:

```text
blockchain.scan
payment.detect
payment.confirm
webhook.dispatch
webhook.retry
notifications.send
analytics.process
```

Every job must be:

- retryable;
- idempotent;
- observable;
- dead-letterable.

---

# 37. Failure handling

Assume everything can fail.

Examples:

```text
RPC unavailable
PostgreSQL unavailable
Redis unavailable
merchant webhook unavailable
blockchain reorg
duplicate transaction
duplicate webhook
worker crash
network timeout
API timeout
```

The system must recover automatically wherever possible.

---

# 38. RPC strategy

Do not hardcode one RPC provider.

Architecture:

```text
BlockchainAdapter
        ↓
RPC Provider Manager
        ↓
┌───────────────┐
│ Provider A    │
│ Provider B    │
│ Provider C    │
└───────────────┘
```

Support:

- timeout;
- retry;
- circuit breaker;
- health checks;
- provider failover.

---

# 39. Observability

## Logs

Structured JSON logs.

Never log:

- passwords;
- API secrets;
- private keys;
- authentication tokens;
- full sensitive personal data.

## Metrics

Track:

```text
payments_created
payments_detected
payments_confirmed
payments_failed
webhooks_sent
webhooks_failed
rpc_errors
rpc_latency
database_latency
queue_depth
queue_failures
api_latency
api_errors
```

## Tracing

Use OpenTelemetry-compatible architecture.

---

# 40. Security model

Security is not a final phase.

It is part of the architecture.

Follow OWASP API Security principles, especially:

- Broken Object Level Authorization;
- Broken Authentication;
- Broken Object Property Level Authorization;
- Unrestricted Resource Consumption;
- Broken Function Level Authorization;
- Sensitive Business Flow abuse;
- SSRF;
- Security Misconfiguration;
- Improper API inventory;
- Unsafe third-party API consumption.

---

# 41. Secrets management

Never store secrets in:

```text
Git
.env committed to repository
database plaintext
logs
frontend
```

Production secrets must come from a secrets manager.

Examples:

```text
AWS Secrets Manager
GCP Secret Manager
Azure Key Vault
HashiCorp Vault
```

Local development may use `.env`.

Provide:

```text
.env.example
```

with no real secrets.

---

# 42. Custody boundary

This project must NOT contain:

```text
merchant private key
customer private key
seed phrase
mnemonic
raw wallet secret
```

in MVP.

The payment address model must be designed carefully.

If the product eventually needs generated merchant deposit addresses, first redesign the custody/security architecture and obtain legal/security review.

Do not silently add wallet custody to the MVP.

---

# 43. Refunds

MVP:

Do not implement automatic on-chain refunds.

Instead:

```text
Refund requested
```

can exist as an internal state, but actual crypto movement must be handled through an explicitly reviewed payout/custody subsystem.

A refund is a new blockchain transaction, not a reversal of the original transaction.

---

# 44. Underpayment

Example:

```text
Invoice: $100
Customer sends: $95
```

Status:

```text
UNDERPAID
```

Never silently mark it PAID.

Merchant dashboard:

```text
Expected
100 USDC

Received
95 USDC

Difference
5 USDC
```

---

# 45. Overpayment

Example:

```text
Expected: 100
Received: 105
```

Status:

```text
OVERPAID
```

Do not automatically refund.

Flag for merchant action.

---

# 46. Expiration

Invoice contains:

```text
expires_at
```

After expiration:

```text
EXPIRED
```

However, blockchain transactions can arrive after expiration.

The system must still detect them.

Do not simply ignore late payments.

Use a state such as:

```text
LATE_PAYMENT
```

or:

```text
PAYMENT_REVIEW_REQUIRED
```

depending on business rules.

---

# 47. Payment matching

A transaction matches an invoice only if:

```text
correct network
AND
correct token contract
AND
correct destination
AND
correct amount
AND
valid transaction status
```

Never match only by amount.

Never match only by address.

Never trust customer-provided metadata.

---

# 48. Public checkout security

Checkout pages must not reveal:

```text
organization_id
internal invoice ID
database IDs
private metadata
API keys
internal configuration
```

Use public opaque IDs.

---

# 49. Metadata

Merchant can send:

```json
{
  "order_id": "12345",
  "customer_id": "abc"
}
```

Metadata must:

- have size limits;
- have key limits;
- have value limits;
- be validated;
- never be executed;
- never be interpreted as SQL/HTML/code.

---

# 50. API design

Public merchant API:

```text
POST /v1/invoices
GET  /v1/invoices/:id
GET  /v1/payments/:id
POST /v1/payment-links
GET  /v1/payment-links/:id
GET  /v1/webhook-endpoints
POST /v1/webhook-endpoints
DELETE /v1/webhook-endpoints/:id
GET  /v1/events
```

Authentication:

```http
Authorization: Bearer cp_live_xxx
```

---

# 51. Create invoice

Example request:

```json
{
  "amount": "49.00",
  "currency": "USD",
  "token": "USDC",
  "network": "base",
  "external_id": "order_12345",
  "description": "Premium subscription",
  "success_url": "https://merchant.com/success",
  "cancel_url": "https://merchant.com/cancel",
  "metadata": {
    "order_id": "12345"
  }
}
```

Response:

```json
{
  "id": "inv_xxxxx",
  "status": "pending",
  "amount": "49.00",
  "currency": "USD",
  "token": "USDC",
  "network": "base",
  "checkout_url": "https://pay.example.com/pay/inv_xxxxx",
  "expires_at": "..."
}
```

---

# 52. Idempotency API

Support:

```text
Idempotency-Key
```

Example:

```http
Idempotency-Key: order_12345_attempt_1
```

Repeated request must return the same logical result.

Never create duplicate invoices because the client retried after a timeout.

---

# 53. API versioning

Use:

```text
/v1/
```

Never break existing API contracts silently.

Future:

```text
/v2/
```

Maintain backward compatibility.

---

# 54. API documentation

Generate OpenAPI specification.

Documentation must include:

- authentication;
- endpoints;
- request examples;
- response examples;
- errors;
- webhooks;
- signature verification;
- idempotency;
- testnet;
- rate limits.

Create an interactive API documentation website.

---

# 55. Error format

Every API error should use consistent structure:

```json
{
  "error": {
    "code": "invoice_expired",
    "message": "Invoice has expired",
    "request_id": "req_xxxxx"
  }
}
```

Never expose stack traces to clients.

---

# 56. Test environment

Create:

```text
TEST mode
LIVE mode
```

Test mode must never interact with production funds.

Use testnet where available.

---

# 57. Testing strategy

## Unit tests

- invoice state machine;
- payment matching;
- amount calculations;
- token validation;
- webhook signing;
- idempotency;
- authorization;
- expiration.

## Integration tests

- PostgreSQL;
- Redis;
- API;
- worker;
- blockchain adapter.

## E2E

Test complete flow:

```text
Create merchant
↓
Create invoice
↓
Open checkout
↓
Simulate blockchain transaction
↓
Detect payment
↓
Confirm payment
↓
Send webhook
↓
Merchant receives event
```

---

# 58. Blockchain test simulator

Before relying on real blockchain infrastructure, implement a deterministic blockchain simulator.

Example:

```text
FakeBlockchainAdapter
```

It must allow tests to create:

```text
valid payment
underpayment
overpayment
wrong token
wrong network
wrong address
failed transaction
reorg
duplicate transaction
late payment
```

This is mandatory for reliable automated testing.

---

# 59. Security tests

Create automated tests for:

```text
BOLA
broken authentication
privilege escalation
rate limit bypass
IDOR
mass assignment
SSRF
webhook replay
webhook forgery
API key leakage
duplicate payment processing
race conditions
```

---

# 60. Race conditions

Payment processing must be safe if the same transaction is processed concurrently by:

```text
worker A
worker B
worker C
```

Use:

- database unique constraints;
- transactions;
- row locking where required;
- idempotent handlers.

Never rely exclusively on application-level checks.

---

# 61. Webhook replay protection

Every webhook contains:

```text
event_id
timestamp
signature
```

Merchant should reject:

```text
old timestamp
duplicate event
invalid signature
```

CryptoPay should provide documentation for verification.

---

# 62. Monitoring dashboard

Internal admin metrics:

```text
Total payments
Successful payments
Underpaid
Overpaid
Expired
Late
Failed

RPC health
Queue health
Database health
Webhook health
API health
```

---

# 63. Merchant dashboard

Dashboard:

```text
Overview

Volume
Successful payments
Fees
Conversion rate

Transactions

Invoices

Payment Links

API Keys

Webhooks

Settings
```

---

# 64. Merchant onboarding

Flow:

```text
Register
↓
Verify email
↓
Create organization
↓
Accept terms
↓
Dashboard
↓
Create API key
↓
Create test invoice
↓
Test payment
↓
Production onboarding
```

Do not expose live functionality before required compliance/business checks are complete.

---

# 65. Compliance architecture

Create explicit compliance boundaries.

Potential future modules:

```text
KYC
KYB
AML
Sanctions screening
Transaction monitoring
Risk scoring
Travel Rule integrations
Case management
```

Do not implement fake compliance logic.

Do not claim:

```text
"AML compliant"
"MiCA compliant"
"regulated"
```

without actual legal/compliance basis.

Before accepting real customer funds in the EU, obtain professional legal/regulatory advice regarding the exact service model and licensing obligations.

---

# 66. Pricing architecture

Do not hardcode pricing into payment logic.

Create:

```text
Plan
Price
FeeRule
```

Example:

```text
STARTER
$19/month
0.8%

BUSINESS
$79/month
0.5%

PRO
$299/month
0.25%
```

Initial MVP can use:

```text
0.5% per successful payment
```

and add subscriptions later.

---

# 67. Business model

Potential revenue:

### Transaction fee

```text
0.25% – 1%
```

### Subscription

```text
$19
$79
$299
```

### Premium features

- advanced analytics;
- more webhooks;
- higher limits;
- multiple users;
- custom checkout;
- branded checkout;
- advanced API;
- priority support.

---

# 68. Future integrations

After MVP:

```text
WooCommerce plugin
Shopify app
REST SDK
Node SDK
Python SDK
PHP SDK
WordPress plugin
Telegram bot
Payment Links
Subscriptions
Invoices
Recurring payments
```

---

# 69. Future blockchain architecture

Add adapters:

```text
EvmAdapter
SolanaAdapter
TronAdapter
BitcoinAdapter
```

Common interface:

```typescript
interface BlockchainAdapter {
  network(): Network;
  validateAddress(address: string): boolean;
  scanBlock(block: number): Promise<Transfer[]>;
  getTransaction(txHash: string): Promise<Transaction>;
  getConfirmations(txHash: string): Promise<number>;
}
```

Payment Core must remain chain-agnostic.

---

# 70. Scaling strategy

Initial:

```text
1 API
1 Worker
1 PostgreSQL
1 Redis
```

Later:

```text
             Load Balancer
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
      API-1      API-2      API-N
        │          │          │
        └──────────┼──────────┘
                   ▼
               PostgreSQL
                   │
             Read Replicas

                   +
                 Redis

                   +
             Worker Pool
          ┌──────┬──────┬──────┐
          ▼      ▼      ▼      ▼
       Worker Worker Worker Worker
```

Do not prematurely introduce Kubernetes.

First establish:

- Docker;
- horizontal API scaling;
- worker scaling;
- PostgreSQL backups;
- Redis;
- queue architecture.

Kubernetes can come later if justified.

---

# 71. Database scaling

Start with PostgreSQL.

Indexes must cover:

```text
organization_id
invoice status
created_at
payment status
tx_hash
network
token
external_id
webhook status
```

At large scale:

```text
partitioning
read replicas
connection pooling
archival
```

Do not introduce these until metrics justify them.

---

# 72. Event architecture

Internally use domain events:

```text
invoice.created
payment.detected
payment.confirming
payment.paid
payment.failed
invoice.expired
webhook.created
webhook.failed
```

Initially events can be implemented through PostgreSQL + queue.

Later migrate selected high-volume events to Kafka/Redpanda if necessary.

Do not add Kafka to MVP.

---

# 73. Security principle

The system must follow:

```text
Never trust the client.
Never trust external APIs.
Never trust blockchain input without verification.
Never trust webhook destinations.
Never trust IDs without authorization.
Never trust frontend payment state.
Never trust floating point money.
Never trust one RPC provider.
```

---

# 74. Threat model

Threats to consider:

### Attacker creates fake payment

Mitigation:

```text
server-side blockchain verification
```

### Attacker changes invoice ID

Mitigation:

```text
object-level authorization
opaque IDs
```

### Attacker steals API key

Mitigation:

```text
hashed keys
key rotation
scopes
revocation
```

### Attacker replays webhook

Mitigation:

```text
timestamp
signature
event ID
```

### Attacker sends thousands of invoices

Mitigation:

```text
rate limits
quotas
abuse detection
```

### Attacker exploits merchant webhook

Mitigation:

```text
SSRF protection
timeouts
network restrictions
response limits
```

### RPC provider compromised

Mitigation:

```text
multiple providers
cross-validation
sanity checks
```

---

# 75. API scopes

API keys should support scopes:

```text
invoices:read
invoices:write
payments:read
payment_links:read
payment_links:write
webhooks:read
webhooks:write
```

Default keys should use least privilege.

---

# 76. Admin security

Admin accounts require:

- 2FA;
- stronger session policy;
- IP/device monitoring;
- audit logs;
- role-based access;
- optional hardware security keys later.

Admin API must be separated from public merchant API.

---

# 77. Backup strategy

PostgreSQL:

```text
daily full backup
continuous WAL / point-in-time recovery
```

Test restoration regularly.

A backup that has never been restored is not considered reliable.

---

# 78. Disaster recovery

Document:

```text
RPO
RTO
backup restoration
database failure
Redis failure
RPC failure
worker failure
region failure
```

Initial target:

```text
RPO < 15 min
RTO < 1 hour
```

Adjust later based on business requirements.

---

# 79. Deployment

CI/CD:

```text
Git push
↓
Lint
↓
Typecheck
↓
Unit tests
↓
Integration tests
↓
Security checks
↓
Build
↓
Docker image
↓
Deploy staging
↓
Smoke tests
↓
Production approval
↓
Deploy
```

Never deploy directly from a developer laptop.

---

# 80. Git workflow

Branches:

```text
main
develop
feature/*
fix/*
```

Require:

- pull request;
- CI;
- tests;
- review before production.

Commit messages should be meaningful.

---

# 81. Environment separation

Strictly separate:

```text
local
development
staging
production
```

Never reuse:

```text
production database
production API keys
production RPC credentials
```

in development.

---

# 82. Documentation

Create:

```text
README.md
ARCHITECTURE.md
SECURITY.md
THREAT_MODEL.md
API.md
DATABASE.md
BLOCKCHAIN.md
WEBHOOKS.md
DEPLOYMENT.md
DISASTER_RECOVERY.md
COMPLIANCE.md
```

---

# 83. Development rules for AI

You are not allowed to:

- invent blockchain transaction formats;
- invent token contract addresses;
- hardcode secrets;
- bypass tests;
- disable authentication to make development easier;
- mark payments paid from frontend input;
- use floating point for money;
- use `any` everywhere;
- silently swallow errors;
- use TODO instead of implementation without explicit reason;
- implement fake security;
- claim regulatory compliance.

If uncertain about a blockchain-specific implementation, research official documentation before coding.

---

# 84. Code quality

Follow:

```text
SOLID
DRY
KISS
YAGNI
Clean Architecture
Domain-driven boundaries
```

But do not create unnecessary abstractions.

Prefer:

```text
clear modules
small services
explicit dependencies
strong types
```

over enormous generic frameworks.

---

# 85. TypeScript rules

Use strict TypeScript.

Required:

```json
{
  "strict": true
}
```

Avoid:

```text
any
unknown without validation
implicit casts
unsafe non-null assertions
```

Validate external input using schemas.

---

# 86. Transaction boundaries

When updating payment state:

```text
BEGIN
  lock payment
  validate current state
  update payment
  create domain event
  create audit event
COMMIT
```

Do not perform blockchain RPC calls while holding long database transactions.

---

# 87. Payment state machine

Implement explicit transition map.

Example:

```text
CREATED → PENDING

PENDING → DETECTED
PENDING → EXPIRED

DETECTED → CONFIRMING
DETECTED → FAILED

CONFIRMING → PAID
CONFIRMING → REORG_DETECTED

REORG_DETECTED → CONFIRMING
REORG_DETECTED → FAILED
```

Invalid transitions must throw a domain error.

---

# 88. No direct database mutation

Business logic must not be:

```text
controller → prisma.invoice.update()
```

without domain validation.

Prefer:

```text
Controller
   ↓
Application Service
   ↓
Domain
   ↓
Repository
   ↓
Database
```

---

# 89. Logging correlation

Every request receives:

```text
request_id
```

Every payment processing operation receives:

```text
correlation_id
```

This allows tracing:

```text
API request
↓
invoice
↓
payment
↓
blockchain scan
↓
worker
↓
webhook
```

---

# 90. Customer experience

Checkout should be extremely simple.

Target:

```text
1. Choose payment
2. Connect wallet / scan QR
3. Pay
4. Wait for confirmation
5. Success
```

Do not overwhelm customers with blockchain terminology.

---

# 91. Merchant experience

Target:

> Developer should be able to accept the first test payment in less than 10 minutes.

Documentation should provide:

```text
1. Create account
2. Create API key
3. Create invoice
4. Open checkout
5. Pay using testnet
6. Receive webhook
```

---

# 92. Competitive positioning

Do not position the product as:

> another crypto wallet.

Position as:

> **Stripe-like infrastructure for businesses that want to accept stablecoin payments.**

Potential differentiators:

- developer-first;
- simple API;
- fast integration;
- Telegram notifications;
- payment links;
- merchant dashboard;
- transparent fees;
- multi-chain architecture;
- excellent documentation.

---

# 93. Product roadmap

## Phase 0 — Architecture

Build:

```text
monorepo
database
authentication
organization model
API structure
CI/CD
Docker
logging
```

## Phase 1 — Fake payments

Implement:

```text
merchant
invoice
checkout
fake blockchain
payment state machine
webhooks
dashboard
```

No real money.

Goal:

> Complete payment flow without blockchain.

## Phase 2 — Testnet

Implement:

```text
blockchain adapter
RPC
block scanner
token transfers
confirmation engine
reorg handling
```

Use testnet.

Goal:

> Real blockchain payment on testnet.

## Phase 3 — Production infrastructure

Implement:

```text
RPC failover
monitoring
alerts
backups
rate limiting
security hardening
audit logs
```

## Phase 4 — Production pilot

Only after:

- legal review;
- business model review;
- security review;
- operational procedures;
- required registrations/authorizations if applicable.

Start with a very small number of merchants.

## Phase 5 — Scale

Add:

```text
more networks
more tokens
payment links
subscriptions
plugins
SDKs
analytics
team accounts
```

---

# 94. Future risk engine

Eventually:

```text
transaction
    ↓
risk scoring
    ↓
sanctions screening
    ↓
address intelligence
    ↓
merchant rules
    ↓
payment decision
```

Possible statuses:

```text
CLEAR
REVIEW
BLOCKED
```

Do not implement fake AML scoring in MVP.

---

# 95. Future merchant features

### Payment Links

```text
https://pay.example.com/l/abc123
```

### Subscriptions

```text
$19/month
```

### Invoices

```text
Invoice #123
Due date
Customer
Amount
Payment status
```

### Recurring payments

Only after careful review of wallet/user authorization model.

Do not assume crypto payments can behave exactly like card subscriptions.

---

# 96. Analytics

Merchant dashboard:

```text
Gross volume
Successful volume
Fees
Successful payments
Failed payments
Conversion
Average payment
Top networks
Top tokens
```

Charts:

```text
daily volume
weekly volume
monthly volume
```

---

# 97. Business metrics

Track internally:

```text
GMV
TPV
take rate
MRR
ARR
active merchants
new merchants
payment success rate
webhook success rate
average payment size
merchant retention
```

---

# 98. Initial business target

Do not attempt to acquire thousands of merchants immediately.

Target:

```text
10 merchants
→
50 merchants
→
100 merchants
→
500 merchants
```

Focus on merchants with a real reason to accept stablecoins:

- digital products;
- SaaS;
- international services;
- freelancers;
- agencies;
- crypto-native businesses;
- global B2B services.

---

# 99. MVP success criteria

MVP is considered complete only when:

- merchant can register;
- merchant can create test API key;
- merchant can create invoice;
- customer can open checkout;
- customer can pay on testnet;
- backend detects payment;
- backend validates token;
- backend validates amount;
- backend validates destination;
- backend tracks confirmations;
- backend handles duplicate detection;
- backend handles failed transaction;
- backend handles late payment;
- invoice transitions correctly;
- webhook is delivered;
- webhook signature can be verified;
- webhook retries work;
- merchant sees payment in dashboard;
- automated tests cover critical flows;
- logs and metrics work;
- Docker deployment works;
- database migrations work;
- no secrets are committed;
- security tests pass.

---

# 100. Definition of done

Do not say:

> "The feature is basically finished."

A feature is done only when:

```text
Implementation
+
Types
+
Validation
+
Error handling
+
Unit tests
+
Integration tests where relevant
+
Security checks
+
Logging
+
Documentation
```

are complete.

---

# 101. How AI should work on the project

Do not generate the entire project in one response.

Work incrementally.

For every phase:

1. Explain architecture.
2. Create files.
3. Implement feature.
4. Run typecheck.
5. Run lint.
6. Run tests.
7. Fix failures.
8. Review security.
9. Update documentation.
10. Move to next phase.

Never continue to the next phase while the current phase has failing critical tests.

---

# 102. First implementation task

Start with:

```text
Phase 0
```

Implement only:

```text
Monorepo
Next.js web
NestJS/Fastify API
Worker
PostgreSQL
Redis
Docker Compose
Prisma/Drizzle
Authentication
Organizations
Membership
API keys
Base logging
Base error handling
OpenAPI
CI
```

Do NOT implement blockchain yet.

---

# 103. Second implementation task

Implement:

```text
Invoice domain
Payment domain
State machines
Idempotency
Checkout
FakeBlockchainAdapter
Payment simulator
Webhook engine
```

Goal:

```text
merchant creates invoice
↓
fake payment
↓
payment detected
↓
payment confirmed
↓
webhook
↓
dashboard
```

---

# 104. Third implementation task

Implement first real blockchain adapter.

Use a testnet.

Implement:

```text
RPC provider
block scanner
token transfer decoder
transaction receipt verification
confirmation tracking
reorg detection
```

Do not implement mainnet until testnet flow is stable.

---

# 105. Fourth implementation task

Security hardening:

```text
rate limiting
API scopes
2FA
SSRF protection
webhook replay protection
audit logs
security headers
CORS policy
CSP
secret management
dependency scanning
SAST
DAST
```

---

# 106. Fifth implementation task

Production readiness:

```text
monitoring
alerts
backup
restore test
RPC failover
worker scaling
API scaling
load tests
stress tests
incident documentation
```

---

# 107. AI operating rules

When you encounter a design decision:

### First

Explain:

```text
Problem
Options
Chosen solution
Reason
Trade-offs
```

### Then

Implement.

Never silently make architectural decisions that affect:

- security;
- money;
- database consistency;
- blockchain verification;
- custody;
- compliance;
- scalability.

---

# 108. Critical principle

The blockchain is an external source of payment evidence.

The internal database is the source of truth for the application's current business state.

Therefore:

```text
Blockchain
    ↓
Verification
    ↓
Payment Domain
    ↓
PostgreSQL
    ↓
Merchant Webhook
```

Never:

```text
Frontend
    ↓
PAID
```

---

# 109. Final product vision

The long-term product should become:

> **Stripe-like payment infrastructure for stablecoins and crypto.**

Merchant should not need to understand:

- RPC;
- blockchain indexing;
- confirmations;
- token contracts;
- transaction receipts;
- reorgs;
- webhook retries.

Merchant sees:

```text
Create payment
        ↓
Customer pays
        ↓
Payment confirmed
        ↓
Your server receives webhook
```

CryptoPay handles the infrastructure underneath.

---

# 110. Final instruction to AI

Build this project as a serious commercial SaaS.

Priorities, in order:

```text
1. Correctness
2. Security
3. Financial consistency
4. Reliability
5. Observability
6. Testability
7. Scalability
8. Developer experience
9. UI polish
10. Feature quantity
```

Never sacrifice correctness or security for speed of implementation.

Do not implement custody, withdrawals, fiat exchange, crypto exchange or regulated financial functionality unless explicitly requested and separately reviewed.

Start with **Phase 0**.

Before writing code, produce:

1. final architecture;
2. database ERD;
3. module dependency graph;
4. API endpoint map;
5. payment state machine;
6. threat model;
7. development plan divided into small implementation tasks.

Then begin implementation task #1.
