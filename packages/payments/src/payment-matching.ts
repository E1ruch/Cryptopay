import type { Prisma } from '@cryptopay/database';

export interface InvoicePaymentTarget {
  network: string;
  token: string;
  paymentAddress: string;
}

export interface DetectedTransfer {
  network: string;
  token: string;
  toAddress: string;
}

/**
 * A transfer belongs to an invoice only if network, token, and destination
 * address all agree (spec §47) — never match on address alone. Phase 1
 * dedicated one payment address per invoice, so this alone was a unique
 * match. Phase 2 reuses one `MerchantWalletAddress` across every invoice on
 * a network/token (spec §42 — no server-generated deposit addresses), so
 * this only narrows the *candidate set*; {@link selectMatchingInvoice}
 * disambiguates within it.
 */
export function matchesInvoice(target: InvoicePaymentTarget, transfer: DetectedTransfer): boolean {
  return (
    target.network === transfer.network &&
    target.token === transfer.token &&
    target.paymentAddress.toLowerCase() === transfer.toAddress.toLowerCase()
  );
}

export interface PendingInvoiceCandidate extends InvoicePaymentTarget {
  id: string;
  amount: Prisma.Decimal;
  createdAt: Date;
}

/**
 * Phase 2: since one merchant address can have several PENDING invoices at
 * once, a single incoming transfer needs one candidate picked out of
 * possibly several `matchesInvoice` hits. Prefer an exact amount match
 * (the common case — the customer paid what the invoice asked for); fall
 * back to the oldest pending invoice otherwise, same as any other
 * address-only match, and let {@link evaluatePaymentAmount} classify the
 * result as under/overpaid downstream.
 *
 * Known limitation (documented, not solved here): two invoices pending on
 * the same address for the exact same amount at the same time can't be
 * told apart by this alone — same spirit as the late-payment and
 * Idempotency-Key gaps already called out for Phase 1.
 */
export function selectMatchingInvoice<T extends PendingInvoiceCandidate>(
  candidates: readonly T[],
  transfer: DetectedTransfer & { amount: Prisma.Decimal },
): T | null {
  const matching = candidates.filter((candidate) => matchesInvoice(candidate, transfer));
  if (matching.length === 0) return null;

  const exact = matching.find((candidate) => candidate.amount.equals(transfer.amount));
  if (exact) return exact;

  const oldestFirst = [...matching].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return oldestFirst[0] ?? null;
}
