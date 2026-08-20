import { describe, expect, it } from 'vitest';
import { formatCountdown } from './use-countdown.js';

describe('formatCountdown', () => {
  it('formats minutes and seconds with zero-padding', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(600)).toBe('10:00');
  });
});
