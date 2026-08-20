import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH_BYTES = 32;

/**
 * Application-level field encryption for secrets that must be readable again
 * (e.g. a user's TOTP secret) — unlike passwords/API keys, these cannot be
 * one-way hashed. Never store such secrets in plaintext (spec §41).
 */
export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = decodeKey(keyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptSecret(encoded: string, keyHex: string): string {
  const key = decodeKey(keyHex);
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function decodeKey(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(`Encryption key must decode to ${KEY_LENGTH_BYTES} bytes, got ${key.length}`);
  }
  return key;
}
