import { InvoiceStatus } from '@cryptopay/database';
import { isAppError } from '@cryptopay/shared';
import { describe, expect, it } from 'vitest';
import { assertInvoiceTransition, canTransitionInvoice } from './invoice-state-machine.js';

describe('invoice state machine', () => {
  it('allows the happy path through to PAID', () => {
    expect(canTransitionInvoice(InvoiceStatus.CREATED, InvoiceStatus.PENDING)).toBe(true);
    expect(canTransitionInvoice(InvoiceStatus.PENDING, InvoiceStatus.DETECTED)).toBe(true);
    expect(canTransitionInvoice(InvoiceStatus.DETECTED, InvoiceStatus.CONFIRMING)).toBe(true);
    expect(canTransitionInvoice(InvoiceStatus.CONFIRMING, InvoiceStatus.PAID)).toBe(true);
  });

  it('allows PAID to be refunded', () => {
    expect(canTransitionInvoice(InvoiceStatus.PAID, InvoiceStatus.REFUNDED)).toBe(true);
  });

  it('rejects skipping states', () => {
    expect(canTransitionInvoice(InvoiceStatus.CREATED, InvoiceStatus.PAID)).toBe(false);
  });

  it('rejects reviving a terminal invoice', () => {
    expect(canTransitionInvoice(InvoiceStatus.EXPIRED, InvoiceStatus.PENDING)).toBe(false);
    expect(canTransitionInvoice(InvoiceStatus.CANCELLED, InvoiceStatus.PENDING)).toBe(false);
    expect(canTransitionInvoice(InvoiceStatus.REFUNDED, InvoiceStatus.PAID)).toBe(false);
  });

  it('never silently allows marking an invoice PAID without confirming (spec §22)', () => {
    expect(canTransitionInvoice(InvoiceStatus.PENDING, InvoiceStatus.PAID)).toBe(false);
    expect(canTransitionInvoice(InvoiceStatus.DETECTED, InvoiceStatus.PAID)).toBe(false);
  });

  it('throws a domain error with from/to details on an illegal transition', () => {
    expect(() => assertInvoiceTransition(InvoiceStatus.CREATED, InvoiceStatus.PAID)).toThrow();
    try {
      assertInvoiceTransition(InvoiceStatus.CREATED, InvoiceStatus.PAID);
      throw new Error('expected assertInvoiceTransition to throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'invalid_state_transition',
        details: { from: InvoiceStatus.CREATED, to: InvoiceStatus.PAID },
      });
    }
  });

  it('does not throw on a legal transition', () => {
    expect(() => assertInvoiceTransition(InvoiceStatus.CREATED, InvoiceStatus.PENDING)).not.toThrow();
  });
});
