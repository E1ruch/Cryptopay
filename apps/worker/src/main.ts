import { Redis } from 'ioredis';
import { loadEnv } from '@cryptopay/config';
import { createLogger } from '@cryptopay/logger';
import { createPrismaClient, type PrismaClient } from '@cryptopay/database';
import { createHealthCheckQueue, createHealthCheckWorker, scheduleHealthCheck } from './queues/health-check.queue.js';
import {
  createWebhookDispatchQueue,
  createWebhookDispatchWorker,
  scheduleWebhookDispatch,
} from './queues/webhook-dispatch.queue.js';
import {
  createWebhookRetryQueue,
  createWebhookRetryWorker,
  scheduleWebhookRetry,
} from './queues/webhook-retry.queue.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({
    name: 'cryptopay-worker',
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === 'development',
  });

  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const prisma: PrismaClient = createPrismaClient({
    databaseUrl: env.DATABASE_URL,
    logQueries: env.NODE_ENV === 'development',
  });
  await prisma.$connect();

  const healthCheckQueue = createHealthCheckQueue(connection);
  await scheduleHealthCheck(healthCheckQueue);

  const healthCheckWorker = createHealthCheckWorker(connection, prisma, connection, logger);
  healthCheckWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'health check job failed');
  });

  const webhookDispatchQueue = createWebhookDispatchQueue(connection);
  await scheduleWebhookDispatch(webhookDispatchQueue);
  const webhookDispatchWorker = createWebhookDispatchWorker(connection, prisma, env.ENCRYPTION_KEY, logger);
  webhookDispatchWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'webhook dispatch job failed');
  });

  const webhookRetryQueue = createWebhookRetryQueue(connection);
  await scheduleWebhookRetry(webhookRetryQueue);
  const webhookRetryWorker = createWebhookRetryWorker(connection, prisma, env.ENCRYPTION_KEY, logger);
  webhookRetryWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'webhook retry job failed');
  });

  logger.info('Worker started — queues ready: health-check, webhook-dispatch, webhook-retry');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await healthCheckWorker.close();
    await healthCheckQueue.close();
    await webhookDispatchWorker.close();
    await webhookDispatchQueue.close();
    await webhookRetryWorker.close();
    await webhookRetryQueue.close();
    await prisma.$disconnect();
    connection.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during worker bootstrap', error);
  process.exit(1);
});
