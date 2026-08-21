import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { BlockchainAdapter } from '@cryptopay/blockchain';
import { InvoiceStatus, Prisma, PaymentStatus, type Invoice, type PrismaClient } from '@cryptopay/database';
import { assertInvoiceTransition, assertPaymentTransition, evaluatePaymentAmount } from '@cryptopay/payments';
import { generateId, NotFoundError } from '@cryptopay/shared';
import type { Logger } from '@cryptopay/logger';
import { QUEUE_NAMES } from './queue-names.js';

const REPEAT_INTERVAL_MS = 5000;
const SCHEDULER_ID = 'payment-confirm-scheduler';

// How long a payment may sit in REORG_DETECTED before we give up waiting
// for the transaction to reappear and fail it outright (spec §25: "the
// payment must be re-evaluated" — not held in limbo forever).
const REORG_GRACE_MS = 10 * 60 * 1000;

export function createPaymentConfirmQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAMES.paymentConfirm, { connection });
}

/** Idempotent — safe to call on every boot without creating duplicate schedules. */
export async function schedulePaymentConfirm(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: REPEAT_INTERVAL_MS }, { name: 'confirm', data: {} });
}

// Carries the parent Invoice alongside a Payment row — finalizePayment
// needs invoice.externalId/currency to build the webhook event payload
// (spec §27) without a second round trip per payment. Exported so the
// `typeof` reference below counts as a use of this value.
export const paymentWithInvoice = Prisma.validator<Prisma.PaymentDefaultArgs>()({ include: { invoice: true } });
type PaymentWithInvoice = Prisma.PaymentGetPayload<typeof paymentWithInvoice>;

/**
 * Confirmation Worker (spec §21) — Phase 2's replacement for apps/api's
 * in-process poller in `BLOCKCHAIN_MODE=evm`. Advances DETECTED →
 * CONFIRMING → CONFIRMED/UNDERPAID/OVERPAID as `REQUIRED_CONFIRMATIONS` is
 * reached, and reacts to a transaction disappearing (reorg, spec §25) by
 * moving CONFIRMING → REORG_DETECTED rather than assuming finality too
 * early. Also expires overdue PENDING invoices — same status-transition
 * family as confirm/finalize, so it lives here rather than in the scanner.
 *
 * Exported standalone so integration tests can run one pass directly
 * against a real database with a stubbed adapter.
 */
export async function runPaymentConfirm(
  prisma: PrismaClient,
  adapter: BlockchainAdapter,
  requiredConfirmations: number,
  logger: Logger,
): Promise<void> {
  await expireOverdueInvoices(prisma);

  const active = await prisma.payment.findMany({
    where: { status: { in: [PaymentStatus.DETECTED, PaymentStatus.CONFIRMING, PaymentStatus.REORG_DETECTED] } },
    include: { invoice: true },
  });

  for (const payment of active) {
    if (!payment.txHash) continue; // DETECTED/CONFIRMING/REORG_DETECTED always have one — defensive only

    let confirmations: number;
    try {
      confirmations = await adapter.getConfirmations(payment.txHash);
    } catch (error) {
      if (error instanceof NotFoundError) {
        await handleMissingTransaction(prisma, payment, logger);
        continue;
      }
      throw error;
    }

    if (payment.status === PaymentStatus.REORG_DETECTED) {
      // The transaction reappeared — resume confirming from where the
      // scanner originally found it.
      await moveToConfirming(prisma, payment, confirmations);
      continue;
    }

    if (payment.status === PaymentStatus.DETECTED) {
      await moveToConfirming(prisma, payment, confirmations);
      continue;
    }

    if (confirmations < requiredConfirmations) {
      if (confirmations !== payment.confirmations) {
        await prisma.payment.update({ where: { id: payment.id }, data: { confirmations } });
      }
      continue;
    }

    await finalizePayment(prisma, payment, confirmations);
  }
}

async function expireOverdueInvoices(prisma: PrismaClient): Promise<void> {
  const overdue = await prisma.invoice.findMany({
    where: { status: InvoiceStatus.PENDING, expiresAt: { lt: new Date() } },
  });
  for (const invoice of overdue) {
    assertInvoiceTransition(InvoiceStatus.PENDING, InvoiceStatus.EXPIRED);
    await prisma.$transaction([
      prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.EXPIRED } }),
      createWebhookEvent(prisma, invoice, 'invoice.expired', InvoiceStatus.EXPIRED, null),
    ]);
  }
}

/**
 * A transaction the scanner previously found no longer resolves. From
 * DETECTED (never confirmed at all) there's nothing to re-evaluate — fail
 * outright, matching the payment state machine (DETECTED has no
 * REORG_DETECTED transition). From CONFIRMING/REORG_DETECTED, spec §25
 * applies: don't assume the payment is gone, mark REORG_DETECTED and give
 * it a grace window to reappear before failing it.
 */
async function handleMissingTransaction(
  prisma: PrismaClient,
  payment: PaymentWithInvoice,
  logger: Logger,
): Promise<void> {
  if (payment.status === PaymentStatus.DETECTED) {
    await failPayment(prisma, payment);
    return;
  }

  if (payment.status === PaymentStatus.CONFIRMING) {
    assertPaymentTransition(PaymentStatus.CONFIRMING, PaymentStatus.REORG_DETECTED);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.REORG_DETECTED } });
    logger.warn({ paymentId: payment.id, txHash: payment.txHash }, 'transaction disappeared — possible reorg');
    return;
  }

  // Already REORG_DETECTED — still missing. Give up once the grace window
  // has elapsed (updatedAt reflects the CONFIRMING -> REORG_DETECTED
  // transition time, since nothing else touches this row while it waits).
  if (Date.now() - payment.updatedAt.getTime() >= REORG_GRACE_MS) {
    await failPayment(prisma, payment);
  }
}

async function failPayment(prisma: PrismaClient, payment: PaymentWithInvoice): Promise<void> {
  assertPaymentTransition(payment.status, PaymentStatus.FAILED);
  assertInvoiceTransition(payment.invoice.status, InvoiceStatus.FAILED);
  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } }),
    prisma.invoice.update({ where: { id: payment.invoiceId }, data: { status: InvoiceStatus.FAILED } }),
  ]);
}

async function moveToConfirming(prisma: PrismaClient, payment: PaymentWithInvoice, confirmations: number): Promise<void> {
  assertPaymentTransition(payment.status, PaymentStatus.CONFIRMING);
  if (payment.invoice.status !== InvoiceStatus.CONFIRMING) {
    assertInvoiceTransition(payment.invoice.status, InvoiceStatus.CONFIRMING);
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.CONFIRMING, confirmations },
    }),
    prisma.invoice.update({ where: { id: payment.invoiceId }, data: { status: InvoiceStatus.CONFIRMING } }),
  ]);
}

/** Spec §44/§45: the exact received amount — never mere arrival — decides exact/underpaid/overpaid. */
async function finalizePayment(prisma: PrismaClient, payment: PaymentWithInvoice, confirmations: number): Promise<void> {
  const outcome = evaluatePaymentAmount(payment.expectedAmount, payment.receivedAmount ?? new Prisma.Decimal(0));
  const paymentStatus =
    outcome === 'exact'
      ? PaymentStatus.CONFIRMED
      : outcome === 'underpaid'
        ? PaymentStatus.UNDERPAID
        : PaymentStatus.OVERPAID;
  const invoiceStatus =
    outcome === 'exact'
      ? InvoiceStatus.PAID
      : outcome === 'underpaid'
        ? InvoiceStatus.UNDERPAID
        : InvoiceStatus.OVERPAID;
  const eventType =
    outcome === 'exact' ? 'payment.paid' : outcome === 'underpaid' ? 'payment.underpaid' : 'payment.overpaid';

  assertPaymentTransition(PaymentStatus.CONFIRMING, paymentStatus);
  assertInvoiceTransition(InvoiceStatus.CONFIRMING, invoiceStatus);

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: paymentStatus, confirmations, confirmedAt: new Date() },
    }),
    prisma.invoice.update({
      where: { id: payment.invoiceId },
      data: { status: invoiceStatus, ...(invoiceStatus === InvoiceStatus.PAID ? { paidAt: new Date() } : {}) },
    }),
    createWebhookEvent(prisma, payment.invoice, eventType, invoiceStatus, payment.txHash),
  ]);
}

/**
 * spec §27: a WebhookEvent row per significant status change. Delivery
 * itself is webhook-dispatch.queue.ts/webhook-retry.queue.ts's concern.
 */
function createWebhookEvent(
  prisma: PrismaClient,
  invoice: Invoice,
  type: string,
  status: InvoiceStatus,
  txHash: string | null,
): Prisma.PrismaPromise<{ id: string }> {
  return prisma.webhookEvent.create({
    data: {
      id: generateId('evt'),
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      type,
      data: {
        invoice_id: invoice.id,
        external_id: invoice.externalId,
        amount: invoice.amount.toString(),
        currency: invoice.currency,
        network: invoice.network,
        status: status.toLowerCase(),
        tx_hash: txHash,
      },
    },
    select: { id: true },
  });
}

export function createPaymentConfirmWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
  adapter: BlockchainAdapter,
  requiredConfirmations: number,
  logger: Logger,
): Worker {
  return new Worker(
    QUEUE_NAMES.paymentConfirm,
    () => runPaymentConfirm(prisma, adapter, requiredConfirmations, logger),
    { connection },
  );
}
