import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { PrismaClient } from '@cryptopay/database';
import type { Logger } from '@cryptopay/logger';
import { deliverWebhook, getRetryDelayMs, type DeliverWebhookInput } from '@cryptopay/webhooks';
import { QUEUE_NAMES } from './queue-names.js';

// Coarser than the dispatch poll — the fastest a retry can ever be due is
// 1 minute out (spec §28's schedule), so polling more often just wastes work.
const REPEAT_INTERVAL_MS = 15_000;
const SCHEDULER_ID = 'webhook-retry-scheduler';
const BATCH_SIZE = 25;

export function createWebhookRetryQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAMES.webhookRetry, { connection });
}

/** Idempotent — safe to call on every boot without creating duplicate schedules. */
export async function scheduleWebhookRetry(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: REPEAT_INTERVAL_MS }, { name: 'retry', data: {} });
}

type DeliverOverrides = Partial<Pick<DeliverWebhookInput, 'fetchImpl' | 'lookupFn'>>;

/**
 * Retries FAILED deliveries whose backoff has elapsed (spec §28: 1m, 5m,
 * 15m, 1h, 6h, 24h with jitter — packages/webhooks getRetryDelayMs).
 * Exhausting the schedule marks the delivery EXHAUSTED rather than retrying
 * forever; the merchant dashboard surfaces delivery status either way.
 *
 * Exported standalone (rather than only inline in the BullMQ processor) so
 * integration tests can run one pass directly against a real database
 * without needing a live Redis-backed Worker.
 */
export async function runWebhookRetry(
  prisma: PrismaClient,
  encryptionKey: string,
  logger: Logger,
  deliverOverrides: DeliverOverrides = {},
): Promise<void> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: 'FAILED', nextRetryAt: { lte: new Date() } },
    include: { event: true, endpoint: true },
    take: BATCH_SIZE,
  });

  for (const delivery of due) {
    const result = await deliverWebhook({
      endpoint: { url: delivery.endpoint.url, secretEnc: delivery.endpoint.secretEnc },
      event: {
        id: delivery.event.id,
        type: delivery.event.type,
        createdAt: delivery.event.createdAt,
        data: delivery.event.data,
      },
      encryptionKey,
      ...deliverOverrides,
    });

    const attempt = delivery.attempt + 1;

    if (result.success) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempt,
          status: 'SUCCEEDED',
          responseTimeMs: result.responseTimeMs,
          deliveredAt: new Date(),
          ...(result.statusCode !== undefined ? { statusCode: result.statusCode } : {}),
        },
      });
      continue;
    }

    const delayMs = getRetryDelayMs(attempt);
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempt,
        status: delayMs === null ? 'EXHAUSTED' : 'FAILED',
        responseTimeMs: result.responseTimeMs,
        nextRetryAt: delayMs === null ? null : new Date(Date.now() + delayMs),
        ...(result.statusCode !== undefined ? { statusCode: result.statusCode } : {}),
        ...(result.error !== undefined ? { error: result.error } : {}),
      },
    });
    if (delayMs === null) {
      logger.error({ deliveryId: delivery.id, attempt }, 'webhook delivery exhausted its retry schedule');
    }
  }
}

export function createWebhookRetryWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
  encryptionKey: string,
  logger: Logger,
): Worker {
  return new Worker(QUEUE_NAMES.webhookRetry, () => runWebhookRetry(prisma, encryptionKey, logger), { connection });
}
