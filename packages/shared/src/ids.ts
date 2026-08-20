import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Opaque, non-sequential public identifiers (e.g. `req_...`, `evt_...`,
 * `org_...`). Never expose internal database IDs externally (spec §19/§48).
 */
export function generateId(prefix: string, length = 24): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes.readUInt8(i) % ALPHABET.length];
  }
  return `${prefix}_${out}`;
}
