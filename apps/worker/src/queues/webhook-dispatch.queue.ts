import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { PrismaClient } from '@cryptopay/database';
import type { Logger } from '@cryptopay/logger';
import { generateId } from '@cryptopay/shared';
import { deliverWebhook, getRetryDelayMs, type DeliverWebhookInput } from '@cryptopay/webhooks';
import { QUEUE_NAMES } from './queue-names.js';

const REPEAT_INTERVAL_MS = 2000;
const SCHEDULER_ID = 'webhook-dispatch-scheduler';
const BATCH_SIZE = 25;

export function createWebhookDispatchQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAMES.webhookDispatch, { connection });
}

/** Idempotent — safe to call on every boot without creating duplicate schedules. */
export async function scheduleWebhookDispatch(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: REPEAT_INTERVAL_MS }, { name: 'dispatch', data: {} });
}

type DeliverOverrides = Partial<Pick<DeliverWebhookInput, 'fetchImpl' | 'lookupFn'>>;

/**
 * First-attempt delivery (spec §27/§28). Finds WebhookEvent rows with no
 * WebhookDelivery yet (`deliveries: { none: {} } }`) and fans each out to
 * every enabled endpoint on its organization. A failed first attempt is
 * left for webhook-retry.queue.ts to pick up once its backoff elapses.
 *
 * Exported standalone (rather than only inline in the BullMQ processor) so
 * integration tests can run one pass directly against a real database
 * without needing a live Redis-backed Worker.
 */
export async function runWebhookDispatch(
  prisma: PrismaClient,
  encryptionKey: string,
  logger: Logger,
  deliverOverrides: DeliverOverrides = {},
): Promise<void> {
  const events = await prisma.webhookEvent.findMany({
    where: { deliveries: { none: {} } },
    include: { organization: { include: { webhookEndpoints: { where: { enabled: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  });

  for (const event of events) {
    for (const endpoint of event.organization.webhookEndpoints) {
      // Unique(eventId, endpointId) guards a double-create if two ticks
      // ever overlap; a conflict here just means another pass already
      // claimed this pair, so skip rather than deliver twice.
      const delivery = await prisma.webhookDelivery
        .create({
          data: { id: generateId('whd'), eventId: event.id, endpointId: endpoint.id, status: 'PENDING' },
        })
        .catch(() => null);
      if (!delivery) continue;

      const result = await deliverWebhook({
        endpoint: { url: endpoint.url, secretEnc: endpoint.secretEnc },
        event: { id: event.id, type: event.type, createdAt: event.createdAt, data: event.data },
        encryptionKey,
        ...deliverOverrides,
      });

      if (result.success) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SUCCEEDED',
            responseTimeMs: result.responseTimeMs,
            deliveredAt: new Date(),
            ...(result.statusCode !== undefined ? { statusCode: result.statusCode } : {}),
          },
        });
        continue;
      }

      const delayMs = getRetryDelayMs(1);
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          responseTimeMs: result.responseTimeMs,
          nextRetryAt: delayMs === null ? null : new Date(Date.now() + delayMs),
          ...(result.statusCode !== undefined ? { statusCode: result.statusCode } : {}),
          ...(result.error !== undefined ? { error: result.error } : {}),
        },
      });
      logger.warn(
        { eventId: event.id, endpointId: endpoint.id, error: result.error },
        'webhook delivery failed, scheduled for retry',
      );
    }
  }
}

export function createWebhookDispatchWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
  encryptionKey: string,
  logger: Logger,
): Worker {
  return new Worker(QUEUE_NAMES.webhookDispatch, () => runWebhookDispatch(prisma, encryptionKey, logger), {
    connection,
  });
}
