import { describe, expect, it } from 'vitest';
import { generateId } from './ids.js';

describe('generateId', () => {
  it('prefixes the id as requested', () => {
    expect(generateId('req')).toMatch(/^req_[0-9a-zA-Z]+$/);
  });

  it('generates unique ids', () => {
    const a = generateId('evt');
    const b = generateId('evt');
    expect(a).not.toBe(b);
  });

  it('respects the requested length', () => {
    const id = generateId('org', 10);
    expect(id.slice('org_'.length)).toHaveLength(10);
  });

  it('never leaks internal database ids (opaque, random)', () => {
    const id = generateId('inv');
    expect(id).not.toMatch(/^inv_\d+$/);
  });
});
