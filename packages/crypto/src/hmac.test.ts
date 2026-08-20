import { describe, expect, it } from 'vitest';
import { signHmacSha256, verifyHmacSha256 } from './hmac.js';

describe('HMAC-SHA256 signing', () => {
  it('produces a deterministic signature for the same payload+secret', () => {
    const a = signHmacSha256('payload', 'secret');
    const b = signHmacSha256('payload', 'secret');
    expect(a).toBe(b);
  });

  it('verifies a valid signature', () => {
    const sig = signHmacSha256('{"type":"payment.paid"}', 'whsec_abc');
    expect(verifyHmacSha256('{"type":"payment.paid"}', 'whsec_abc', sig)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const sig = signHmacSha256('{"amount":"49.00"}', 'whsec_abc');
    expect(verifyHmacSha256('{"amount":"9999.00"}', 'whsec_abc', sig)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const sig = signHmacSha256('payload', 'secret-a');
    expect(verifyHmacSha256('payload', 'secret-b', sig)).toBe(false);
  });

  it('rejects a malformed signature without throwing', () => {
    expect(verifyHmacSha256('payload', 'secret', 'not-hex-!!')).toBe(false);
  });
});
