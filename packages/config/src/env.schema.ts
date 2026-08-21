import { z } from 'zod';

const secret = (minLength = 32) =>
  z
    .string()
    .min(minLength, `must be at least ${minLength} characters — generate with e.g. openssl rand -hex 32`);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // API
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((s) => s.trim())),

  // Web / checkout
  WEB_BASE_URL: z.string().url().default('http://localhost:3000'),
  CHECKOUT_BASE_URL: z.string().url().default('http://localhost:3000/pay'),

  // Whether auth cookies get the `Secure` attribute. Deliberately separate
  // from NODE_ENV: a NODE_ENV=production build can still run behind plain
  // HTTP in a self-hosted docker-compose smoke test, and forcing Secure
  // there would silently break login (browsers drop the cookie). Real
  // production deployments (behind TLS) must set this to true.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // Database
  DATABASE_URL: z
    .string()
    .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
      message: 'must be a postgresql:// connection string',
    }),

  // Redis
  REDIS_URL: z.string().startsWith('redis://').or(z.string().startsWith('rediss://')),

  // Auth secrets — no defaults, must be explicit even in dev
  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
  SESSION_COOKIE_SECRET: secret(),
  CSRF_SECRET: secret(),
  API_KEY_PEPPER: secret(),
  // AES-256-GCM key for reversible field encryption (e.g. TOTP secrets) — 32 bytes hex-encoded.
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'must be a 64-char hex string (32 bytes)'),

  // Token lifetimes (seconds)
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900), // 15 min
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2592000), // 30 days

  // Argon2id parameters
  ARGON2_MEMORY_COST_KIB: z.coerce.number().int().positive().default(19456), // ~19 MiB
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),

  // Rate limiting
  RATE_LIMIT_LOGIN_PER_MINUTE: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(300),
  // Public checkout is unauthenticated by design (spec §19) — its own,
  // more generous IP-keyed bucket (spec §30 example: 100/minute/IP).
  RATE_LIMIT_CHECKOUT_PER_MINUTE: z.coerce.number().int().positive().default(100),

  // Confirmation policy (spec §24) — never hardcode this assumption
  // elsewhere; every place that checks "is this payment final yet" reads it
  // from here. Phase 1's fake chain still respects it, so the same
  // detect-then-confirm pipeline carries over unchanged into Phase 2.
  REQUIRED_CONFIRMATIONS: z.coerce.number().int().positive().default(3),
  // How often FakeBlockchainAdapter "mines" a block, in ms (spec §93 Phase
  // 1: fake blockchain). Only meaningful in BLOCKCHAIN_MODE=fake.
  BLOCKCHAIN_BLOCK_TIME_MS: z.coerce.number().int().positive().default(2000),
  // 'fake' (default) keeps every existing Phase 0/1 flow — in-memory chain,
  // in-process apps/api poller, zero external calls. 'evm' switches the
  // `base` network to a real Base Sepolia RPC adapter and moves payment
  // detection/confirmation onto apps/worker's blockchainScan/paymentConfirm
  // queues (spec §93 Phase 2) — see docs/architecture/ARCHITECTURE.md.
  BLOCKCHAIN_MODE: z.enum(['fake', 'evm']).default('fake'),
  // Public Base Sepolia endpoint by default — swap in a paid provider
  // (Alchemy/Infura/QuickNode) here later without any code change. RPC
  // failover across multiple providers is Phase 3 scope (spec §38), not this.
  BASE_SEPOLIA_RPC_URL: z.string().url().default('https://sepolia.base.org'),
});

export type Env = z.infer<typeof envSchema>;
