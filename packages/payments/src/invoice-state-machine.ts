import { InvoiceStatus } from '@cryptopay/database';
import { InvalidStateTransitionError } from '@cryptopay/shared';

/**
 * Explicit transition map for Invoice.status (spec §16/§87). Business logic
 * must call {@link assertInvoiceTransition} before persisting a new status —
 * never mutate the column directly (spec §88: no direct database mutation
 * without domain validation).
 */
const INVOICE_TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  [InvoiceStatus.CREATED]: [InvoiceStatus.PENDING],
  [InvoiceStatus.PENDING]: [InvoiceStatus.DETECTED, InvoiceStatus.EXPIRED, InvoiceStatus.CANCELLED],
  [InvoiceStatus.DETECTED]: [InvoiceStatus.CONFIRMING, InvoiceStatus.FAILED],
  [InvoiceStatus.CONFIRMING]: [
    InvoiceStatus.PAID,
    InvoiceStatus.UNDERPAID,
    InvoiceStatus.OVERPAID,
    InvoiceStatus.FAILED,
  ],
  // Underpaid/overpaid are flagged for merchant review (spec §44/§45) rather
  // than auto-resolved; a refund is the only system-driven way out.
  [InvoiceStatus.UNDERPAID]: [InvoiceStatus.REFUNDED],
  [InvoiceStatus.OVERPAID]: [InvoiceStatus.REFUNDED],
  [InvoiceStatus.PAID]: [InvoiceStatus.REFUNDED],
  [InvoiceStatus.EXPIRED]: [],
  [InvoiceStatus.FAILED]: [],
  [InvoiceStatus.CANCELLED]: [],
  [InvoiceStatus.REFUNDED]: [],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[from].includes(to);
}

/**
 * Throws {@link InvalidStateTransitionError} unless `from -> to` is a legal
 * Invoice transition. Callers persist the new status only after this passes.
 */
export function assertInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!canTransitionInvoice(from, to)) {
    throw new InvalidStateTransitionError(`Invoice cannot transition from ${from} to ${to}`, {
      from,
      to,
    });
  }
}
