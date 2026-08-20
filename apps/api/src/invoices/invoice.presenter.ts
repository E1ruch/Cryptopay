import type { Invoice } from '@cryptopay/database';

export interface InvoiceView {
  id: string;
  organizationId: string;
  externalId: string | null;
  status: string;
  description: string | null;
  amount: string;
  currency: string;
  token: string;
  network: string;
  paymentAddress: string;
  successUrl: string | null;
  cancelUrl: string | null;
  metadata: unknown;
  checkoutUrl: string;
  expiresAt: Date;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** `amount` is serialized as a decimal string — never a JS number (spec §18). */
export function toInvoiceView(invoice: Invoice, checkoutBaseUrl: string): InvoiceView {
  return {
    id: invoice.id,
    organizationId: invoice.organizationId,
    externalId: invoice.externalId,
    status: invoice.status,
    description: invoice.description,
    amount: invoice.amount.toString(),
    currency: invoice.currency,
    token: invoice.token,
    network: invoice.network,
    paymentAddress: invoice.paymentAddress,
    successUrl: invoice.successUrl,
    cancelUrl: invoice.cancelUrl,
    metadata: invoice.metadata,
    checkoutUrl: `${checkoutBaseUrl}/${invoice.id}`,
    expiresAt: invoice.expiresAt,
    paidAt: invoice.paidAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}
