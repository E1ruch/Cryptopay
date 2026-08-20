import { describe, expect, it } from 'vitest';
import { metadataSchema, METADATA_MAX_KEYS } from './metadata.schema.js';

describe('metadataSchema', () => {
  it('accepts plain primitive values', () => {
    const result = metadataSchema.safeParse({ order_id: '12345', priority: 1, urgent: true });
    expect(result.success).toBe(true);
  });

  it('rejects nested objects (no arbitrary structure)', () => {
    const result = metadataSchema.safeParse({ nested: { a: 1 } });
    expect(result.success).toBe(false);
  });

  it('rejects too many keys', () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: METADATA_MAX_KEYS + 1 }, (_, i) => [`key${i}`, 'v']),
    );
    const result = metadataSchema.safeParse(tooMany);
    expect(result.success).toBe(false);
  });

  it('rejects an oversized value', () => {
    const result = metadataSchema.safeParse({ note: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});
