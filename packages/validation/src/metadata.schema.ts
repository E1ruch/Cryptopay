import { z } from 'zod';

export const METADATA_MAX_KEYS = 20;
export const METADATA_MAX_KEY_LENGTH = 40;
export const METADATA_MAX_VALUE_LENGTH = 500;

/**
 * Merchant-supplied metadata (spec §49): size/key/value limits enforced,
 * primitives only — never executed, never interpreted as SQL/HTML/code.
 */
export const metadataSchema = z
  .record(
    z.string().min(1).max(METADATA_MAX_KEY_LENGTH),
    z.union([z.string().max(METADATA_MAX_VALUE_LENGTH), z.number(), z.boolean(), z.null()]),
  )
  .refine((obj) => Object.keys(obj).length <= METADATA_MAX_KEYS, {
    message: `metadata cannot contain more than ${METADATA_MAX_KEYS} keys`,
  });
export type Metadata = z.infer<typeof metadataSchema>;
