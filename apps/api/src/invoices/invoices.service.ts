import { Injectable } from '@nestjs/common';
import { InvoiceStatus, type Invoice } from '@cryptopay/database';
import { assertInvoiceTransition } from '@cryptopay/payments';
import { ConflictError, NotFoundError, generateId } from '@cryptopay/shared';
import type { CreateInvoiceInput } from '@cryptopay/validation';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../common/request-context.util.js';
import { PrismaService } from '../database/prisma.service.js';
import { WalletAddressesService } from '../wallet-addresses/wallet-addresses.service.js';

// Phase 1 has no product-configurable expiry yet — a fixed window is enough
// to demonstrate the complete flow (spec §93 Phase 1 goal).
const INVOICE_EXPIRY_MS = 30 * 60 * 1000;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly walletAddresses: WalletAddressesService,
  ) {}

  async create(
    organizationId: string,
    apiKeyId: string,
    input: CreateInvoiceInput,
    ctx: RequestContext,
  ): Promise<Invoice> {
    if (input.externalId !== undefined) {
      const existing = await this.prisma.invoice.findUnique({
        where: { organizationId_externalId: { organizationId, externalId: input.externalId } },
      });
      if (existing) {
        return this.assertIdempotentReplay(existing, input);
      }
    }

    // CREATED -> PENDING happens atomically at creation: the invoice is
    // payable (has an address, an expiry) the moment it exists (spec §16).
    assertInvoiceTransition(InvoiceStatus.CREATED, InvoiceStatus.PENDING);

    // Throws ValidationError if the org hasn't set a deposit address for
    // this network/token yet (evm mode) — fake mode auto-provisions one.
    const paymentAddress = await this.walletAddresses.getDepositAddress(organizationId, input.network, input.token);

    const invoice = await this.prisma.invoice.create({
      data: {
        id: generateId('inv'),
        organizationId,
        status: InvoiceStatus.PENDING,
        amount: input.amount,
        currency: input.currency,
        token: input.token,
        network: input.network,
        paymentAddress,
        expiresAt: new Date(Date.now() + INVOICE_EXPIRY_MS),
        ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.successUrl !== undefined ? { successUrl: input.successUrl } : {}),
        ...(input.cancelUrl !== undefined ? { cancelUrl: input.cancelUrl } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });

    await this.audit.record({
      organizationId,
      actorId: apiKeyId,
      actorType: 'api_key',
      action: 'invoice.create',
      resourceType: 'invoice',
      resourceId: invoice.id,
      metadata: {
        amount: input.amount,
        currency: input.currency,
        token: input.token,
        network: input.network,
      },
      ...ctx,
    });

    return invoice;
  }

  /**
   * BOLA-safe lookup (spec §12): scoping by organizationId in the same
   * query, never a bare id lookup followed by an ownership check after.
   */
  async getById(organizationId: string, invoiceId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    return invoice;
  }

  /** For the merchant dashboard (spec §63) — newest first, offset-paginated. */
  async list(
    organizationId: string,
    { page, limit }: { page: number; limit: number },
  ): Promise<{ data: Invoice[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where: { organizationId } }),
    ]);
    return { data, total };
  }

  /**
   * Spec §26/§52: retrying invoice creation with the same external_id must
   * return the original invoice rather than creating a duplicate — but only
   * if every other field matches too, otherwise this is a client bug (a
   * reused external_id with different parameters), not a legitimate retry.
   */
  private assertIdempotentReplay(existing: Invoice, input: CreateInvoiceInput): Invoice {
    const matches =
      existing.amount.equals(input.amount) &&
      existing.currency === input.currency &&
      existing.token === input.token &&
      existing.network === input.network;
    if (!matches) {
      throw new ConflictError(
        `An invoice with external_id "${input.externalId ?? ''}" already exists with different parameters`,
      );
    }
    return existing;
  }
}
