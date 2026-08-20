import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@cryptopay/database';
import type { Logger } from '@cryptopay/logger';
import { QUEUE_NAMES } from './queue-names.js';

const REPEAT_INTERVAL_MS = 30_000;
const SCHEDULER_ID = 'health-check-scheduler';

export function createHealthCheckQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAMES.healthCheck, { connection });
}

/** Idempotent — safe to call on every boot without creating duplicate schedules. */
export async function scheduleHealthCheck(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: REPEAT_INTERVAL_MS }, { name: 'ping', data: {} });
}

export function createHealthCheckWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
  redis: Redis,
  logger: Logger,
): Worker {
  return new Worker(
    QUEUE_NAMES.healthCheck,
    async () => {
      const [dbOk, redisOk] = await Promise.all([checkDatabase(prisma), checkRedis(redis)]);
      logger.info({ dbOk, redisOk }, 'health check');
      if (!dbOk || !redisOk) {
        throw new Error(`Health check failed: database=${dbOk} redis=${redisOk}`);
      }
    },
    { connection },
  );
}

export async function checkDatabase(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function checkRedis(redis: Redis): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
