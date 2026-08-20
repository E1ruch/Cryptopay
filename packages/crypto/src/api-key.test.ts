import { describe, expect, it } from 'vitest';
import { generateApiKey, verifyApiKey, parseApiKeyEnvironment } from './api-key.js';

const PEPPER = 'test-pepper-value';

describe('API key generation', () => {
  it('generates a live key with the correct prefix', () => {
    const key = generateApiKey('live', PEPPER);
    expect(key.raw.startsWith('cp_live_')).toBe(true);
    expect(key.prefix.startsWith('cp_live_')).toBe(true);
    expect(key.raw).not.toBe(key.hash);
  });

  it('generates a test key with the correct prefix', () => {
    const key = generateApiKey('test', PEPPER);
    expect(key.raw.startsWith('cp_test_')).toBe(true);
  });

  it('never persists the raw key in the hash', () => {
    const key = generateApiKey('live', PEPPER);
    expect(key.hash).not.toContain(key.raw);
  });

  it('verifies a key against its own hash', () => {
    const key = generateApiKey('live', PEPPER);
    expect(verifyApiKey(key.raw, PEPPER, key.hash)).toBe(true);
  });

  it('rejects verification with the wrong pepper', () => {
    const key = generateApiKey('live', PEPPER);
    expect(verifyApiKey(key.raw, 'wrong-pepper', key.hash)).toBe(false);
  });

  it('rejects a raw key that does not match the stored hash', () => {
    const keyA = generateApiKey('live', PEPPER);
    const keyB = generateApiKey('live', PEPPER);
    expect(verifyApiKey(keyA.raw, PEPPER, keyB.hash)).toBe(false);
  });

  it('generates unique raw keys on each call', () => {
    const a = generateApiKey('live', PEPPER);
    const b = generateApiKey('live', PEPPER);
    expect(a.raw).not.toBe(b.raw);
  });

  it('parses environment from a raw key prefix', () => {
    expect(parseApiKeyEnvironment('cp_live_abc123')).toBe('live');
    expect(parseApiKeyEnvironment('cp_test_abc123')).toBe('test');
    expect(parseApiKeyEnvironment('sk_live_abc123')).toBeNull();
  });
});
