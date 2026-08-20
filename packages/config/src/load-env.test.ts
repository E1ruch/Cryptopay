import { describe, expect, it, beforeEach } from 'vitest';
import { loadEnv, resetEnvCache, InvalidEnvironmentError } from './load-env.js';

const validEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/cryptopay',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  SESSION_COOKIE_SECRET: 'c'.repeat(32),
  CSRF_SECRET: 'd'.repeat(32),
  API_KEY_PEPPER: 'e'.repeat(32),
  ENCRYPTION_KEY: 'f'.repeat(64),
};

describe('loadEnv', () => {
  beforeEach(() => {
    resetEnvCache();
  });

  it('parses a valid environment and applies defaults', () => {
    const env = loadEnv(validEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('throws InvalidEnvironmentError when a required secret is missing', () => {
    const rest: NodeJS.ProcessEnv = { ...validEnv };
    delete rest.JWT_ACCESS_SECRET;
    expect(() => loadEnv(rest)).toThrow(InvalidEnvironmentError);
  });

  it('throws when a secret is too short', () => {
    const env: NodeJS.ProcessEnv = { ...validEnv, JWT_ACCESS_SECRET: 'short' };
    expect(() => loadEnv(env)).toThrow(InvalidEnvironmentError);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    const env: NodeJS.ProcessEnv = { ...validEnv, DATABASE_URL: 'mysql://localhost/db' };
    expect(() => loadEnv(env)).toThrow(InvalidEnvironmentError);
  });

  it('memoizes the result across calls', () => {
    const first = loadEnv(validEnv);
    const second = loadEnv({});
    expect(second).toBe(first);
  });
});
