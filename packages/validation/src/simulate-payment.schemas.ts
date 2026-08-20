import { z } from 'zod';
import { decimalAmountSchema } from './invoice.schemas.js';

/**
 * Dev/test-only (Phase 1 — spec §58 "blockchain test simulator"): omit
 * `amount` to pay exactly what's due, or override it to exercise the
 * underpayment/overpayment paths.
 */
export const simulatePaymentSchema = z.object({
  amount: decimalAmountSchema.optional(),
});
export type SimulatePaymentInput = z.infer<typeof simulatePaymentSchema>;
