import { describe, expect, it } from 'vitest';
import { getRetryDelayMs, RETRY_SCHEDULE_MS } from './retry-schedule.js';

const noJitter = () => 0.5; // (0.5 * 2 - 1) = 0 -> exactly the base delay

describe('getRetryDelayMs', () => {
  it('follows the spec §28 schedule: 1m, 5m, 15m, 1h, 6h, 24h', () => {
    expect(RETRY_SCHEDULE_MS).toEqual([60_000, 300_000, 900_000, 3_600_000, 21_600_000, 86_400_000]);
    for (let attempt = 1; attempt <= RETRY_SCHEDULE_MS.length; attempt++) {
      expect(getRetryDelayMs(attempt, noJitter)).toBe(RETRY_SCHEDULE_MS[attempt - 1]);
    }
  });

  it('returns null once the schedule is exhausted', () => {
    expect(getRetryDelayMs(RETRY_SCHEDULE_MS.length + 1, noJitter)).toBeNull();
  });

  it('applies up to +/-20% jitter around the base delay', () => {
    const delay = getRetryDelayMs(1, () => 1); // max positive jitter
    expect(delay).toBe(Math.round(60_000 * 1.2));
    const delayLow = getRetryDelayMs(1, () => 0); // max negative jitter
    expect(delayLow).toBe(Math.round(60_000 * 0.8));
  });
});
