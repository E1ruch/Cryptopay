import { signHmacSha256 } from '@cryptopay/crypto';

/** Domain-separated HMAC so the same base secret can hash distinct opaque
 * token types (refresh tokens, email verification tokens) without their
 * hash spaces colliding. */
export function hashOpaqueToken(raw: string, secret: string, purpose: string): string {
  return signHmacSha256(raw, `${secret}:${purpose}`);
}
