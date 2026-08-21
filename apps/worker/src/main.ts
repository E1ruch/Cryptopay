import type { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createBlockchainAdapterRegistry } from '@cryptopay/blockchain';
import { loadEnv } from '@cryptopay/config';
import { createLogger } from '@cryptopay/logger';
import { createPrismaClient, type PrismaClient } from '@cryptopay/database';
import {
  createBlockchainScanQueue,
  createBlockchainScanWorker,
  scheduleBlockchainScan,
} from './queues/blockchain-scan.queue.js';
import { createHealthCheckQueue, createHealthCheckWorker, scheduleHealthCheck } from './queues/health-check.queue.js';
import {
  createPaymentConfirmQueue,
  createPaymentConfirmWorker,
  schedulePaymentConfirm,
} from './queues/payment-confirm.queue.js';
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

  // BLOCKCHAIN_MODE=fake (default) keeps payment detection/confirmation on
  // apps/api's in-process poller (FakeBlockchainAdapter's state is
  // process-local — see payments.service.ts's class doc comment), so these
  // two queues stay off entirely rather than scanning a chain nothing else
  // can see. BLOCKCHAIN_MODE=evm (Phase 2) is what activates them.
  let blockchainScanWorker: Worker | undefined;
  let blockchainScanQueue: Queue | undefined;
  let paymentConfirmWorker: Worker | undefined;
  let paymentConfirmQueue: Queue | undefined;

  if (env.BLOCKCHAIN_MODE === 'evm') {
    const registry = createBlockchainAdapterRegistry({
      mode: env.BLOCKCHAIN_MODE,
      blockTimeMs: env.BLOCKCHAIN_BLOCK_TIME_MS,
      baseSepoliaRpcUrl: env.BASE_SEPOLIA_RPC_URL,
    });
    const network = 'base';
    const adapter = registry.get(network);
    if (!adapter) throw new Error(`No blockchain adapter registered for network "${network}"`);

    blockchainScanQueue = createBlockchainScanQueue(connection);
    await scheduleBlockchainScan(blockchainScanQueue);
    blockchainScanWorker = createBlockchainScanWorker(connection, prisma, adapter, network, logger);
    blockchainScanWorker.on('failed', (job, error) => {
      logger.error({ jobId: job?.id, err: error }, 'blockchain scan job failed');
    });

    paymentConfirmQueue = createPaymentConfirmQueue(connection);
    await schedulePaymentConfirm(paymentConfirmQueue);
    paymentConfirmWorker = createPaymentConfirmWorker(
      connection,
      prisma,
      adapter,
      env.REQUIRED_CONFIRMATIONS,
      logger,
    );
    paymentConfirmWorker.on('failed', (job, error) => {
      logger.error({ jobId: job?.id, err: error }, 'payment confirm job failed');
    });
  }

  const activeQueues = ['health-check', 'webhook-dispatch', 'webhook-retry'];
  if (env.BLOCKCHAIN_MODE === 'evm') activeQueues.push('blockchain-scan', 'payment-confirm');
  logger.info(`Worker started — queues ready: ${activeQueues.join(', ')}`);

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
    if (blockchainScanWorker) await blockchainScanWorker.close();
    if (blockchainScanQueue) await blockchainScanQueue.close();
    if (paymentConfirmWorker) await paymentConfirmWorker.close();
    if (paymentConfirmQueue) await paymentConfirmQueue.close();
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
