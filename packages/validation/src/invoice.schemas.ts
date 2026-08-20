import { z } from 'zod';
import { metadataSchema } from './metadata.schema.js';

// A decimal string, e.g. "49.00" — a JS number can't represent money exactly
// (spec §18), so the wire format is a string from end to end.
export const decimalAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,8})?$/, 'amount must be a decimal string, e.g. "49.00"')
  .refine((value) => Number(value) > 0, 'amount must be greater than zero');

export const createInvoiceSchema = z.object({
  externalId: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(500).optional(),
  amount: decimalAmountSchema,
  currency: z.string().trim().min(1).max(10),
  token: z.string().trim().min(1).max(20),
  network: z.string().trim().min(1).max(40),
  successUrl: z.string().trim().url().max(2048).optional(),
  cancelUrl: z.string().trim().url().max(2048).optional(),
  metadata: metadataSchema.optional(),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
