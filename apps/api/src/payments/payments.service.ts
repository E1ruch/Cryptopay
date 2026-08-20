import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { FakeBlockchainAdapter, type BlockchainAdapter, type TokenTransfer } from '@cryptopay/blockchain';
import { InvoiceStatus, Prisma, PaymentStatus, type Invoice } from '@cryptopay/database';
import { assertInvoiceTransition, assertPaymentTransition, evaluatePaymentAmount } from '@cryptopay/payments';
import { ConflictError, NotFoundError, generateId } from '@cryptopay/shared';
import type { SimulatePaymentInput } from '@cryptopay/validation';
import { BLOCKCHAIN_ADAPTER } from '../blockchain/blockchain-adapter.token.js';
import { ENV, type Env } from '../config/env.provider.js';
import { PrismaService } from '../database/prisma.service.js';

// Carries the parent Invoice alongside a Payment row — advanceConfirmations
// needs invoice.externalId/currency to build the webhook event payload
// (spec §27) without a second round trip per payment. Exported so the
// `typeof` reference below counts as a use of this value.
export const paymentWithInvoice = Prisma.validator<Prisma.PaymentDefaultArgs>()({ include: { invoice: true } });
export type PaymentWithInvoice = Prisma.PaymentGetPayload<typeof paymentWithInvoice>;

// How often the detection/confirmation pipeline re-checks chain state.
// Independent of BLOCKCHAIN_BLOCK_TIME_MS — this is polling cadence, not
// block time (spec §21: "the server is the source of truth", polled, never
// pushed).
const TICK_INTERVAL_MS = 1000;

/**
 * Phase 1's payment pipeline (spec §21/§93). Runs as an in-process interval
 * rather than an apps/worker BullMQ job: FakeBlockchainAdapter's state is
 * in-memory and process-local, so detection must run in the same process
 * that owns the BLOCKCHAIN_ADAPTER instance (this API process, via
 * BlockchainModule). Phase 2's real adapter talks to an RPC — a genuine
 * shared source of truth any process can reach — which is what actually
 * lets this move to apps/worker's already-scaffolded blockchainScan /
 * paymentConfirm queues.
 */
@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private lastScannedBlock = -1;
  // Guards against the background interval and a manual/simulate-triggered
  // tick() overlapping — each tick does read-then-write state transitions
  // without row locking, so two interleaved ticks could double-process.
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(BLOCKCHAIN_ADAPTER) private readonly blockchain: BlockchainAdapter,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.tick().catch((error: unknown) => {
        console.error('payments pipeline tick failed', error);
      });
    }, TICK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Dev/test-only stand-in for a customer's wallet broadcasting a transfer
   * (spec §58 "blockchain test simulator"). Ticks immediately afterward so
   * the caller sees the detected state without waiting on the interval —
   * spec §91: "accept the first test payment in less than 10 minutes."
   *
   * Merchant-authenticated variant: BOLA-scoped by organizationId, for the
   * merchant API / dashboard.
   */
  async simulatePayment(
    organizationId: string,
    invoiceId: string,
    input: SimulatePaymentInput,
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    return this.doSimulatePayment(invoice, input);
  }

  /**
   * Same as {@link simulatePayment}, but for the public checkout page (spec
   * §19) — there is no authenticated organization context there, only the
   * invoice's own opaque public id, which is the intended access boundary
   * for checkout (unlike the merchant API, where BOLA scoping matters).
   */
  async simulatePaymentForCheckout(invoiceId: string, input: SimulatePaymentInput): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    return this.doSimulatePayment(invoice, input);
  }

  private async doSimulatePayment(invoice: Invoice, input: SimulatePaymentInput): Promise<Invoice> {
    if (invoice.status !== InvoiceStatus.PENDING) {
      throw new ConflictError(`Invoice is ${invoice.status}, not awaiting payment`);
    }
    if (!(this.blockchain instanceof FakeBlockchainAdapter)) {
      throw new ConflictError('Payment simulation is only available on the fake blockchain adapter');
    }

    this.blockchain.simulatePayment({
      token: invoice.token,
      toAddress: invoice.paymentAddress,
      amount: new Prisma.Decimal(input.amount ?? invoice.amount),
    });

    await this.tick();

    return this.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.expireOverdueInvoices();
      await this.detectNewPayments();
      await this.advanceConfirmations();
    } finally {
      this.ticking = false;
    }
  }

  private async expireOverdueInvoices(): Promise<void> {
    const overdue = await this.prisma.invoice.findMany({
      where: { status: InvoiceStatus.PENDING, expiresAt: { lt: new Date() } },
    });
    for (const invoice of overdue) {
      assertInvoiceTransition(InvoiceStatus.PENDING, InvoiceStatus.EXPIRED);
      await this.prisma.$transaction([
        this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.EXPIRED },
        }),
        this.createWebhookEvent(invoice, 'invoice.expired', InvoiceStatus.EXPIRED, null),
      ]);
    }
  }

  private async detectNewPayments(): Promise<void> {
    const latestBlock = await this.blockchain.getLatestBlock();
    for (let block = this.lastScannedBlock + 1; block <= latestBlock; block++) {
      const transfers = await this.blockchain.getTokenTransfers(block);
      for (const transfer of transfers) {
        await this.tryMatchTransfer(transfer);
      }
    }
    // Never mark the current latest block as fully scanned: FakeBlockchainAdapter
    // has no finality — a simulated transfer can still land in it after this
    // scan runs (block number only advances once BLOCKCHAIN_BLOCK_TIME_MS has
    // elapsed), so leave it eligible to be rescanned until a newer block
    // appears. tryMatchTransfer is idempotent, so rescanning is harmless.
    this.lastScannedBlock = Math.max(this.lastScannedBlock, latestBlock - 1);
  }

  /**
   * Matches by payment address alone: each invoice gets one dedicated,
   * globally-unique address (spec §16, enforced by a DB unique constraint),
   * so the address itself already identifies the invoice — unlike a real
   * multi-invoice-per-address scanner, there's no candidate set to
   * disambiguate with packages/payments' matchesInvoice (that helper is
   * exercised directly in its own unit tests; Phase 2's real scanner, which
   * does have to disambiguate across many addresses, is where it gets used
   * here too).
   */
  private async tryMatchTransfer(transfer: TokenTransfer): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { paymentAddress: transfer.toAddress, status: InvoiceStatus.PENDING },
    });
    if (!invoice || invoice.token !== transfer.token) return;

    const alreadySeen = await this.prisma.payment.findUnique({
      where: { network_txHash: { network: invoice.network, txHash: transfer.txHash } },
    });
    if (alreadySeen) return; // spec §26: idempotent block/tx processing

    assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.DETECTED);
    assertInvoiceTransition(InvoiceStatus.PENDING, InvoiceStatus.DETECTED);

    await this.prisma.$transaction([
      this.prisma.payment.create({
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
      this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.DETECTED },
      }),
    ]);
  }

  private async advanceConfirmations(): Promise<void> {
    const active = await this.prisma.payment.findMany({
      where: { status: { in: [PaymentStatus.DETECTED, PaymentStatus.CONFIRMING] } },
      include: { invoice: true },
    });

    for (const payment of active) {
      if (!payment.txHash) continue; // DETECTED/CONFIRMING always have one — defensive only

      let confirmations: number;
      try {
        confirmations = await this.blockchain.getConfirmations(payment.txHash);
      } catch (error) {
        if (error instanceof NotFoundError) {
          // FakeBlockchainAdapter's state is in-memory only (spec §93 Phase
          // 1) and doesn't survive an API process restart, unlike a real
          // RPC (Phase 2) that any process can still query after restarting.
          // Without this, a restart with in-flight payments would throw
          // here every tick forever, aborting confirmation progress for
          // every *other* payment in the same batch too.
          await this.failOrphanedPayment(payment);
          continue;
        }
        throw error;
      }

      if (payment.status === PaymentStatus.DETECTED) {
        await this.moveToConfirming(payment, confirmations);
        continue;
      }

      if (confirmations < this.env.REQUIRED_CONFIRMATIONS) {
        if (confirmations !== payment.confirmations) {
          await this.prisma.payment.update({ where: { id: payment.id }, data: { confirmations } });
        }
        continue;
      }

      await this.finalizePayment(payment, confirmations);
    }
  }

  private async failOrphanedPayment(payment: PaymentWithInvoice): Promise<void> {
    assertPaymentTransition(payment.status, PaymentStatus.FAILED);
    assertInvoiceTransition(payment.invoice.status, InvoiceStatus.FAILED);
    await this.prisma.$transaction([
      this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } }),
      this.prisma.invoice.update({ where: { id: payment.invoiceId }, data: { status: InvoiceStatus.FAILED } }),
    ]);
  }

  private async moveToConfirming(payment: PaymentWithInvoice, confirmations: number): Promise<void> {
    assertPaymentTransition(PaymentStatus.DETECTED, PaymentStatus.CONFIRMING);
    assertInvoiceTransition(InvoiceStatus.DETECTED, InvoiceStatus.CONFIRMING);

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.CONFIRMING, confirmations },
      }),
      this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: InvoiceStatus.CONFIRMING },
      }),
    ]);
  }

  /** Spec §44/§45: the exact received amount — never mere arrival — decides exact/underpaid/overpaid. */
  private async finalizePayment(payment: PaymentWithInvoice, confirmations: number): Promise<void> {
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

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: paymentStatus, confirmations, confirmedAt: new Date() },
      }),
      this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          status: invoiceStatus,
          ...(invoiceStatus === InvoiceStatus.PAID ? { paidAt: new Date() } : {}),
        },
      }),
      this.createWebhookEvent(payment.invoice, eventType, invoiceStatus, payment.txHash),
    ]);
  }

  /**
   * spec §27: a WebhookEvent row per significant status change. Delivery
   * itself (signing, SSRF-checked HTTP, retries) is a separate concern —
   * apps/worker's webhook-dispatch/webhook-retry queues pick up rows created
   * here and fan them out to every enabled WebhookEndpoint on the org.
   */
  private createWebhookEvent(
    invoice: Invoice,
    type: string,
    status: InvoiceStatus,
    txHash: string | null,
  ): Prisma.PrismaPromise<{ id: string }> {
    return this.prisma.webhookEvent.create({
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
}
