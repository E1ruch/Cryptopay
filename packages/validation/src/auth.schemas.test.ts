import { describe, expect, it } from 'vitest';
import { registerSchema, loginSchema } from './auth.schemas.js';

describe('registerSchema', () => {
  it('accepts a valid email and password', () => {
    const result = registerSchema.safeParse({ email: 'User@Example.com', password: 'password123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('rejects a password without a digit', () => {
    const result = registerSchema.safeParse({ email: 'a@b.com', password: 'onlyletters' });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 10 characters', () => {
    const result = registerSchema.safeParse({ email: 'a@b.com', password: 'ab1' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = registerSchema.safeParse({ email: 'not-an-email', password: 'password123' });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts email + password without totp', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'anything' });
    expect(result.success).toBe(true);
  });

  it('accepts an optional 6-digit totp code', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'x', totpCode: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed totp code', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'x', totpCode: '12' });
    expect(result.success).toBe(false);
  });
});
