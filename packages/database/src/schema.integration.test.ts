import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from './client.js';
import type { PrismaClient } from '../generated/client/index.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var for integration test: ${name}`);
  return value;
}

const prisma: PrismaClient = createPrismaClient({ databaseUrl: required('DATABASE_URL') });

async function cleanDatabase() {
  await prisma.idempotencyKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('database schema constraints', () => {
  it('enforces a unique email per user', async () => {
    await prisma.user.create({ data: { email: 'a@b.com', passwordHash: 'hash' } });
    await expect(
      prisma.user.create({ data: { email: 'a@b.com', passwordHash: 'hash2' } }),
    ).rejects.toThrow();
  });

  it('enforces a unique organization slug', async () => {
    await prisma.organization.create({ data: { name: 'Acme', slug: 'acme' } });
    await expect(
      prisma.organization.create({ data: { name: 'Acme Two', slug: 'acme' } }),
    ).rejects.toThrow();
  });

  it('prevents duplicate membership of the same user in the same organization', async () => {
    const user = await prisma.user.create({ data: { email: 'u@x.com', passwordHash: 'h' } });
    const org = await prisma.organization.create({ data: { name: 'Org', slug: 'org-1' } });
    await prisma.membership.create({ data: { userId: user.id, organizationId: org.id } });
    await expect(
      prisma.membership.create({ data: { userId: user.id, organizationId: org.id } }),
    ).rejects.toThrow();
  });

  it('cascades: deleting an organization removes its API keys', async () => {
    const org = await prisma.organization.create({ data: { name: 'Org', slug: 'org-cascade' } });
    await prisma.apiKey.create({
      data: {
        organizationId: org.id,
        name: 'default',
        environment: 'test',
        keyPrefix: 'cp_test_abcd',
        keyHash: 'hash-1',
        scopes: ['invoices:read'],
      },
    });
    await prisma.organization.delete({ where: { id: org.id } });
    const remaining = await prisma.apiKey.findMany({ where: { organizationId: org.id } });
    expect(remaining).toHaveLength(0);
  });

  it('enforces one idempotency key per organization', async () => {
    const org = await prisma.organization.create({ data: { name: 'Org', slug: 'org-idem' } });
    const expiresAt = new Date(Date.now() + 60_000);
    await prisma.idempotencyKey.create({
      data: { organizationId: org.id, key: 'order_1', requestHash: 'h1', expiresAt },
    });
    await expect(
      prisma.idempotencyKey.create({
        data: { organizationId: org.id, key: 'order_1', requestHash: 'h2', expiresAt },
      }),
    ).rejects.toThrow();
  });

  it('does not FK-constrain a second organization to the same idempotency key value', async () => {
    const orgA = await prisma.organization.create({ data: { name: 'A', slug: 'org-a' } });
    const orgB = await prisma.organization.create({ data: { name: 'B', slug: 'org-b' } });
    const expiresAt = new Date(Date.now() + 60_000);
    await prisma.idempotencyKey.create({
      data: { organizationId: orgA.id, key: 'order_1', requestHash: 'h1', expiresAt },
    });
    await expect(
      prisma.idempotencyKey.create({
        data: { organizationId: orgB.id, key: 'order_1', requestHash: 'h1', expiresAt },
      }),
    ).resolves.toBeDefined();
  });
});
