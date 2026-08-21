import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { BlockchainAdapter } from '@cryptopay/blockchain';
import { InvoiceStatus, PaymentStatus, type PrismaClient } from '@cryptopay/database';
import { assertInvoiceTransition, assertPaymentTransition, selectMatchingInvoice } from '@cryptopay/payments';
import { generateId } from '@cryptopay/shared';
import type { Logger } from '@cryptopay/logger';
import { QUEUE_NAMES } from './queue-names.js';

const REPEAT_INTERVAL_MS = 5000;
const SCHEDULER_ID = 'blockchain-scan-scheduler';

export function createBlockchainScanQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAMES.blockchainScan, { connection });
}

/** Idempotent — safe to call on every boot without creating duplicate schedules. */
export async function scheduleBlockchainScan(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: REPEAT_INTERVAL_MS }, { name: 'scan', data: {} });
}

/**
 * Block Scanner → Transfer Decoder → Address Matcher → Payment Matcher
 * (spec §21), Phase 2's replacement for apps/api's in-process poller (see
 * `apps/api/src/payments/payments.service.ts`'s class doc comment — that
 * one stays active only in `BLOCKCHAIN_MODE=fake`).
 *
 * The scan watermark lives in `BlockchainScanCursor` (one row per network)
 * rather than in-process memory: this worker can restart independently of
 * everything else, and a real RPC is a genuine shared source of truth any
 * process can pick back up from (unlike Phase 1's in-memory fake chain).
 *
 * Exported standalone so integration tests can run one pass directly
 * against a real database with a stubbed adapter, same pattern as
 * `runWebhookDispatch`/`runWebhookRetry`.
 */
export async function runBlockchainScan(
  prisma: PrismaClient,
  adapter: BlockchainAdapter,
  network: string,
  logger: Logger,
): Promise<void> {
  // Omit lastScannedBlock on create so the schema default (-1, "nothing
  // scanned yet") applies — block numbers are 0-based, so hardcoding 0 here
  // would wrongly mean "block 0 already scanned" and skip it.
  const cursor = await prisma.blockchainScanCursor.upsert({
    where: { network },
    create: { network },
    update: {},
  });

  const latestBlock = await adapter.getLatestBlock();
  const fromBlock = Number(cursor.lastScannedBlock) + 1;
  if (latestBlock < fromBlock) return; // nothing new since the last scan

  const transfers = await adapter.getTokenTransfers(fromBlock, latestBlock);
  for (const transfer of transfers) {
    await tryMatchTransfer(prisma, transfer, logger);
  }

  await prisma.blockchainScanCursor.update({
    where: { network },
    data: { lastScannedBlock: BigInt(latestBlock) },
  });
}

/**
 * Phase 2: a merchant's payment address is reused across every invoice on a
 * network/token (spec §42), so several PENDING invoices can share one
 * address — `selectMatchingInvoice` (packages/payments) picks the one whose
 * expected amount exactly matches the transfer, falling back to the oldest
 * pending invoice otherwise. Known limitation: two invoices pending on the
 * same address for the exact same amount at once aren't disambiguated
 * further (documented on selectMatchingInvoice itself).
 */
async function tryMatchTransfer(
  prisma: PrismaClient,
  transfer: Awaited<ReturnType<BlockchainAdapter['getTokenTransfers']>>[number],
  logger: Logger,
): Promise<void> {
  const candidates = await prisma.invoice.findMany({
    where: {
      paymentAddress: transfer.toAddress,
      network: transfer.network,
      token: transfer.token,
      status: InvoiceStatus.PENDING,
    },
  });
  const invoice = selectMatchingInvoice(candidates, transfer);
  if (!invoice) return;

  const alreadySeen = await prisma.payment.findUnique({
    where: { network_txHash: { network: invoice.network, txHash: transfer.txHash } },
  });
  if (alreadySeen) return; // spec §26: idempotent block/tx processing

  assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.DETECTED);
  assertInvoiceTransition(InvoiceStatus.PENDING, InvoiceStatus.DETECTED);

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        id: generateId('pay'),
        invoiceId: invoice.id,
        organizationId: invoice.organizationId,
        network: invoice.network,
        token: transfer.token,
        expectedAmount: invoice.amount,
        receivedAmount: transfer.amount,
        txHash: transfer.txHash,
        fromAddress: transfer.fromAddress,
        toAddress: transfer.toAddress,
        blockNumber: transfer.blockNumber,
        status: PaymentStatus.DETECTED,
        detectedAt: new Date(),
      },
    }),
    prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.DETECTED } }),
  ]);
  logger.info({ invoiceId: invoice.id, txHash: transfer.txHash }, 'payment detected');
}

export function createBlockchainScanWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
  adapter: BlockchainAdapter,
  network: string,
  logger: Logger,
): Worker {
  return new Worker(QUEUE_NAMES.blockchainScan, () => runBlockchainScan(prisma, adapter, network, logger), {
    connection,
  });
}
