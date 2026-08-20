import { PaymentStatus } from '@cryptopay/database';
import { InvalidStateTransitionError } from '@cryptopay/shared';

/**
 * Explicit transition map for a single Payment attempt's blockchain-
 * detection lifecycle (spec §17/§87). Distinct from the Invoice's own
 * status: an invoice aggregates one or more of these attempts (spec §17).
 */
const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  [PaymentStatus.PENDING]: [PaymentStatus.DETECTED, PaymentStatus.FAILED],
  [PaymentStatus.DETECTED]: [PaymentStatus.CONFIRMING, PaymentStatus.FAILED],
  [PaymentStatus.CONFIRMING]: [
    PaymentStatus.CONFIRMED,
    PaymentStatus.UNDERPAID,
    PaymentStatus.OVERPAID,
    PaymentStatus.REORG_DETECTED,
    PaymentStatus.FAILED,
  ],
  [PaymentStatus.REORG_DETECTED]: [PaymentStatus.CONFIRMING, PaymentStatus.FAILED],
  [PaymentStatus.CONFIRMED]: [],
  [PaymentStatus.UNDERPAID]: [],
  [PaymentStatus.OVERPAID]: [],
  [PaymentStatus.FAILED]: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/**
 * Throws {@link InvalidStateTransitionError} unless `from -> to` is a legal
 * Payment transition. Callers persist the new status only after this passes.
 */
export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new InvalidStateTransitionError(`Payment cannot transition from ${from} to ${to}`, {
      from,
      to,
    });
  }
}
