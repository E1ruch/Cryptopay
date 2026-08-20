import type { Invoice } from '@cryptopay/database';

/**
 * The public-safe view of an Invoice for the customer-facing checkout page
 * (spec §19/§48). Deliberately excludes organizationId, externalId, and
 * metadata — none of that is the customer's business, and §48 explicitly
 * forbids leaking internal identifiers or private merchant data here.
 */
export interface CheckoutView {
  id: string;
  status: string;
  merchantName: string;
  description: string | null;
  amount: string;
  currency: string;
  token: string;
  network: string;
  paymentAddress: string;
  expiresAt: Date;
  successUrl: string | null;
  cancelUrl: string | null;
}

export function toCheckoutView(invoice: Invoice, merchantName: string): CheckoutView {
  return {
    id: invoice.id,
    status: invoice.status,
    merchantName,
    description: invoice.description,
    amount: invoice.amount.toString(),
    currency: invoice.currency,
    token: invoice.token,
    network: invoice.network,
    paymentAddress: invoice.paymentAddress,
    expiresAt: invoice.expiresAt,
    successUrl: invoice.successUrl,
    cancelUrl: invoice.cancelUrl,
  };
}
