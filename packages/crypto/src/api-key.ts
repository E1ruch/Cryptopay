import { randomBytes } from 'node:crypto';
import { signHmacSha256, safeEqualHex } from './hmac.js';

export type ApiKeyEnvironment = 'test' | 'live';

const RAW_SECRET_BYTES = 24; // 192 bits of entropy — no per-key salt needed
const DISPLAY_PREFIX_LENGTH = 12;

export interface GeneratedApiKey {
  /** Full secret — shown to the merchant exactly once, never persisted. */
  raw: string;
  /** Short, non-secret prefix safe to store/display for identification (spec §15). */
  prefix: string;
  /** HMAC-SHA256(pepper, raw) — what actually gets persisted. */
  hash: string;
  environment: ApiKeyEnvironment;
}

function keyPrefix(environment: ApiKeyEnvironment): `cp_${ApiKeyEnvironment}_` {
  return `cp_${environment}_`;
}

/** `pepper` is a server-side secret (config: API_KEY_PEPPER) kept out of the
 * database — without it, a stolen DB dump alone cannot be used to match a
 * captured raw key or brute-force keys offline. */
export function generateApiKey(environment: ApiKeyEnvironment, pepper: string): GeneratedApiKey {
  const secret = randomBytes(RAW_SECRET_BYTES).toString('base64url');
  const raw = `${keyPrefix(environment)}${secret}`;
  return {
    raw,
    prefix: raw.slice(0, DISPLAY_PREFIX_LENGTH),
    hash: hashApiKey(raw, pepper),
    environment,
  };
}

export function hashApiKey(raw: string, pepper: string): string {
  return signHmacSha256(raw, pepper);
}

export function verifyApiKey(raw: string, pepper: string, storedHash: string): boolean {
  return safeEqualHex(hashApiKey(raw, pepper), storedHash);
}

/** Cheap pre-check to route a raw key to test/live handling before hashing. */
export function parseApiKeyEnvironment(raw: string): ApiKeyEnvironment | null {
  if (raw.startsWith(keyPrefix('live'))) return 'live';
  if (raw.startsWith(keyPrefix('test'))) return 'test';
  return null;
}
