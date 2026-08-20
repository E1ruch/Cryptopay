import { Injectable } from '@nestjs/common';
import { Prisma } from '@cryptopay/database';
import { NotFoundError } from '@cryptopay/shared';
import { PrismaService } from '../database/prisma.service.js';

// Exported so the `typeof` reference below counts as a use of this value.
export const invoiceWithMerchant = Prisma.validator<Prisma.InvoiceDefaultArgs>()({
  include: { organization: { select: { name: true } } },
});
export type InvoiceWithMerchant = Prisma.InvoiceGetPayload<typeof invoiceWithMerchant>;

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Looked up by the invoice's own opaque public id alone — that id *is*
   * the access boundary for the public checkout page (spec §19), not an
   * organization scope like the merchant API.
   */
  async getForCheckout(invoiceId: string): Promise<InvoiceWithMerchant> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { organization: { select: { name: true } } },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    return invoice;
  }
}
