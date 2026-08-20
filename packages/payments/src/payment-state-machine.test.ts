import { PaymentStatus } from '@cryptopay/database';
import { describe, expect, it } from 'vitest';
import { assertPaymentTransition, canTransitionPayment } from './payment-state-machine.js';

describe('payment state machine', () => {
  it('allows the happy path through to CONFIRMED', () => {
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.DETECTED)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.DETECTED, PaymentStatus.CONFIRMING)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.CONFIRMING, PaymentStatus.CONFIRMED)).toBe(true);
  });

  it('allows a reorg to be re-evaluated back into confirming (spec §25)', () => {
    expect(canTransitionPayment(PaymentStatus.CONFIRMING, PaymentStatus.REORG_DETECTED)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.REORG_DETECTED, PaymentStatus.CONFIRMING)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.REORG_DETECTED, PaymentStatus.FAILED)).toBe(true);
  });

  it('classifies under/overpayment only from CONFIRMING', () => {
    expect(canTransitionPayment(PaymentStatus.CONFIRMING, PaymentStatus.UNDERPAID)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.CONFIRMING, PaymentStatus.OVERPAID)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.UNDERPAID)).toBe(false);
  });

  it('treats CONFIRMED/UNDERPAID/OVERPAID/FAILED as terminal', () => {
    for (const terminal of [
      PaymentStatus.CONFIRMED,
      PaymentStatus.UNDERPAID,
      PaymentStatus.OVERPAID,
      PaymentStatus.FAILED,
    ]) {
      expect(canTransitionPayment(terminal, PaymentStatus.CONFIRMING)).toBe(false);
    }
  });

  it('rejects skipping states', () => {
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.CONFIRMED)).toBe(false);
  });

  it('throws on an illegal transition', () => {
    expect(() => assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.CONFIRMED)).toThrow();
  });
});
