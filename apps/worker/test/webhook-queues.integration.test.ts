import { loadEnv } from '@cryptopay/config';
import { encryptSecret, generateWebhookSecret } from '@cryptopay/crypto';
import { createPrismaClient, type PrismaClient } from '@cryptopay/database';
import { createLogger, type Logger } from '@cryptopay/logger';
import { generateId } from '@cryptopay/shared';
import { RETRY_SCHEDULE_MS } from '@cryptopay/webhooks';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWebhookDispatch } from '../src/queues/webhook-dispatch.queue.js';
import { runWebhookRetry } from '../src/queues/webhook-retry.queue.js';

const env = loadEnv();
const prisma: PrismaClient = createPrismaClient({ databaseUrl: env.DATABASE_URL });
const logger: Logger = createLogger({ name: 'test', level: 'silent' });
const resolvesPublic = () => Promise.resolve([{ address: '93.184.216.34' }]);

async function cleanDatabase(): Promise<void> {
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.organization.deleteMany();
}

async function setupOrgWithEndpointAndEvent() {
  const organization = await prisma.organization.create({
    data: { name: 'Acme', slug: `acme-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });

  const secret = generateWebhookSecret();
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      id: generateId('we'),
      organizationId: organization.id,
      url: 'https://merchant.example.com/webhook',
      secretEnc: encryptSecret(secret, env.ENCRYPTION_KEY),
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      id: generateId('inv'),
      organizationId: organization.id,
      status: 'PAID',
      amount: '49.00',
      currency: 'USD',
      token: 'USDC',
      network: 'base',
      paymentAddress: `0x${Math.random().toString(16).slice(2).padEnd(40, '0')}`,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const event = await prisma.webhookEvent.create({
    data: {
      id: generateId('evt'),
      organizationId: organization.id,
      invoiceId: invoice.id,
      type: 'payment.paid',
      data: { invoice_id: invoice.id, status: 'paid' },
    },
  });

  return { organization, endpoint, event };
}

describe('webhook dispatch & retry pipeline (spec §27/§28/§29)', () => {
  beforeEach(cleanDatabase);
  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('delivers a new event and marks it SUCCEEDED, with a valid signature', async () => {
    const { endpoint, event } = await setupOrgWithEndpointAndEvent();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await runWebhookDispatch(prisma, env.ENCRYPTION_KEY, logger, { fetchImpl, lookupFn: resolvesPublic });

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({
      where: { eventId: event.id, endpointId: endpoint.id },
    });
    expect(delivery.status).toBe('SUCCEEDED');
    expect(delivery.statusCode).toBe(200);
    expect(delivery.deliveredAt).not.toBeNull();

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(endpoint.url);
    const headers = init.headers as Record<string, string>;
    expect(headers['X-CryptoPay-Event-ID']).toBe(event.id);
    expect(headers['X-CryptoPay-Signature']).toBeTruthy();
  });

  it('does not deliver twice across repeated dispatch passes (spec §26 idempotency)', async () => {
    const { endpoint, event } = await setupOrgWithEndpointAndEvent();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await runWebhookDispatch(prisma, env.ENCRYPTION_KEY, logger, { fetchImpl, lookupFn: resolvesPublic });
    await runWebhookDispatch(prisma, env.ENCRYPTION_KEY, logger, { fetchImpl, lookupFn: resolvesPublic });

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { eventId: event.id, endpointId: endpoint.id },
    });
    expect(deliveries).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('schedules a retry roughly 1 minute out on a failed first attempt (spec §28)', async () => {
    const { event } = await setupOrgWithEndpointAndEvent();
    const fetchImpl = vi.fn().mockResolvedValue(new Response('server error', { status: 500 }));

    await runWebhookDispatch(prisma, env.ENCRYPTION_KEY, logger, { fetchImpl, lookupFn: resolvesPublic });

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { eventId: event.id } });
    expect(delivery.status).toBe('FAILED');
    expect(delivery.statusCode).toBe(500);
    expect(delivery.nextRetryAt).not.toBeNull();
    const delayMs = delivery.nextRetryAt!.getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(RETRY_SCHEDULE_MS[0]! * 0.7); // schedule[0] with -20% jitter floor
    expect(delayMs).toBeLessThan(RETRY_SCHEDULE_MS[0]! * 1.3);
  });

  it('retries a due FAILED delivery and marks it SUCCEEDED once the endpoint recovers', async () => {
    const { endpoint, event } = await setupOrgWithEndpointAndEvent();
    await prisma.webhookDelivery.create({
      data: {
        id: generateId('whd'),
        eventId: event.id,
        endpointId: endpoint.id,
        attempt: 1,
        status: 'FAILED',
        nextRetryAt: new Date(Date.now() - 1000), // already due
      },
    });

    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await runWebhookRetry(prisma, env.ENCRYPTION_KEY, logger, { fetchImpl, lookupFn: resolvesPublic });

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { eventId: event.id } });
    expect(delivery.status).toBe('SUCCEEDED');
    expect(delivery.attempt).toBe(2);
  });

  it('marks a delivery EXHAUSTED once every scheduled retry has failed (spec §28)', async () => {
    const { endpoint, event } = await setupOrgWithEndpointAndEvent();
    await prisma.webhookDelivery.create({
      data: {
        id: generateId('whd'),
        eventId: event.id,
        endpointId: endpoint.id,
        attempt: RETRY_SCHEDULE_MS.length, // the last scheduled attempt already happened
        status: 'FAILED',
        nextRetryAt: new Date(Date.now() - 1000),
      },
    });

    const fetchImpl = vi.fn().mockResolvedValue(new Response('still down', { status: 500 }));
    await runWebhookRetry(prisma, env.ENCRYPTION_KEY, logger, { fetchImpl, lookupFn: resolvesPublic });

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { eventId: event.id } });
    expect(delivery.status).toBe('EXHAUSTED');
    expect(delivery.nextRetryAt).toBeNull();
  });

  it('does not attempt a FAILED delivery before its backoff has elapsed', async () => {
    const { endpoint, event } = await setupOrgWithEndpointAndEvent();
    await prisma.webhookDelivery.create({
      data: {
        id: generateId('whd'),
        eventId: event.id,
        endpointId: endpoint.id,
        attempt: 1,
        status: 'FAILED',
        nextRetryAt: new Date(Date.now() + 60_000), // not due yet
      },
    });

    const fetchImpl = vi.fn();
    await runWebhookRetry(prisma, env.ENCRYPTION_KEY, logger, { fetchImpl, lookupFn: resolvesPublic });

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
