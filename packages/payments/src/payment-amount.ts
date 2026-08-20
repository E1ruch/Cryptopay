import type { Prisma } from '@cryptopay/database';

export type PaymentAmountMatch = 'exact' | 'underpaid' | 'overpaid';

/**
 * Classifies a received amount against what the invoice expects (spec
 * §44/§45). Never mark an invoice PAID just because *a* transfer arrived —
 * the exact amount always decides exact/underpaid/overpaid.
 */
export function evaluatePaymentAmount(
  expectedAmount: Prisma.Decimal,
  receivedAmount: Prisma.Decimal,
): PaymentAmountMatch {
  const comparison = receivedAmount.comparedTo(expectedAmount);
  if (comparison === 0) return 'exact';
  return comparison < 0 ? 'underpaid' : 'overpaid';
}
