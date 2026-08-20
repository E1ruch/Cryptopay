import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret } from './encryption.js';

const KEY = randomBytes(32).toString('hex');

describe('field encryption (AES-256-GCM)', () => {
  it('round-trips a plaintext secret', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', KEY);
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(encrypted, KEY)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produces different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-secret', KEY);
    const b = encryptSecret('same-secret', KEY);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with the wrong key', () => {
    const encrypted = encryptSecret('top-secret', KEY);
    const wrongKey = randomBytes(32).toString('hex');
    expect(() => decryptSecret(encrypted, wrongKey)).toThrow();
  });

  it('fails to decrypt tampered ciphertext (auth tag mismatch)', () => {
    const encrypted = encryptSecret('top-secret', KEY);
    const buf = Buffer.from(encrypted, 'base64');
    const lastIndex = buf.length - 1;
    buf[lastIndex] = (buf.readUInt8(lastIndex) ^ 0xff) & 0xff;
    const tampered = buf.toString('base64');
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() => encryptSecret('secret', 'ab')).toThrow(/32 bytes/);
  });
});
