import { randomBytes } from 'node:crypto';

const SECRET_BYTES = 24; // 192 bits

/**
 * A webhook signing secret — shown to the merchant once at creation, then
 * stored encrypted (packages/crypto encryptSecret) and used only
 * server-side to compute outgoing HMAC-SHA256 signatures (spec §27).
 * Unlike an API key, it's never hashed for verification: we need it back in
 * plaintext to sign every delivery.
 */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(SECRET_BYTES).toString('base64url')}`;
}
