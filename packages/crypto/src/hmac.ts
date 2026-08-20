import { createHmac, timingSafeEqual } from 'node:crypto';

export function signHmacSha256(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time comparison — never use `===` on signatures/hashes. */
export function verifyHmacSha256(payload: string, secret: string, signatureHex: string): boolean {
  const expected = signHmacSha256(payload, secret);
  return safeEqualHex(expected, signatureHex);
}

export function safeEqualHex(aHex: string, bHex: string): boolean {
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(aHex, 'hex');
    b = Buffer.from(bHex, 'hex');
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
