import { describe, expect, it } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  it('joins truthy class names with a space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('filters out false, null, and undefined', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('supports conditional classes', () => {
    const active = true;
    const disabled = false;
    expect(cn('base', active && 'active', disabled && 'disabled')).toBe('base active');
  });

  it('returns an empty string when nothing is truthy', () => {
    expect(cn(false, undefined, null)).toBe('');
  });
});
