import { Prisma } from '@cryptopay/database';
import { describe, expect, it } from 'vitest';
import { evaluatePaymentAmount } from './payment-amount.js';

const decimal = (value: string) => new Prisma.Decimal(value);

describe('evaluatePaymentAmount', () => {
  it('reports an exact match', () => {
    expect(evaluatePaymentAmount(decimal('49.00'), decimal('49.00'))).toBe('exact');
  });

  it('reports underpaid when less than expected arrives (spec §44)', () => {
    expect(evaluatePaymentAmount(decimal('100'), decimal('95'))).toBe('underpaid');
  });

  it('reports overpaid when more than expected arrives (spec §45)', () => {
    expect(evaluatePaymentAmount(decimal('100'), decimal('105'))).toBe('overpaid');
  });

  it('is precise at high decimal precision, unlike float arithmetic (spec §18)', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE754 float — Decimal must not repeat that bug.
    const expected = decimal('0.3');
    const received = decimal('0.1').plus(decimal('0.2'));
    expect(evaluatePaymentAmount(expected, received)).toBe('exact');
  });
});
