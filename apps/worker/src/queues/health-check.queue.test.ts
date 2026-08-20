import { describe, expect, it, vi } from 'vitest';
import { checkDatabase, checkRedis } from './health-check.queue.js';
import type { PrismaClient } from '@cryptopay/database';
import type { Redis } from 'ioredis';

describe('checkDatabase', () => {
  it('returns true when the query succeeds', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) } as unknown as PrismaClient;
    await expect(checkDatabase(prisma)).resolves.toBe(true);
  });

  it('returns false when the query throws', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as PrismaClient;
    await expect(checkDatabase(prisma)).resolves.toBe(false);
  });
});

describe('checkRedis', () => {
  it('returns true on PONG', async () => {
    const redis = { ping: vi.fn().mockResolvedValue('PONG') } as unknown as Redis;
    await expect(checkRedis(redis)).resolves.toBe(true);
  });

  it('returns false when ping throws', async () => {
    const redis = { ping: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) } as unknown as Redis;
    await expect(checkRedis(redis)).resolves.toBe(false);
  });

  it('returns false on an unexpected reply', async () => {
    const redis = { ping: vi.fn().mockResolvedValue('WRONG') } as unknown as Redis;
    await expect(checkRedis(redis)).resolves.toBe(false);
  });
});
