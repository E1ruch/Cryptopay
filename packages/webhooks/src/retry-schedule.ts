/** Fixed retry schedule (spec §28): 1m, 5m, 15m, 1h, 6h, 24h after the previous attempt. */
export const RETRY_SCHEDULE_MS: readonly number[] = [
  60_000, // 1 min
  300_000, // 5 min
  900_000, // 15 min
  3_600_000, // 1 hour
  21_600_000, // 6 hours
  86_400_000, // 24 hours
];

const JITTER_RATIO = 0.2;

/**
 * Delay before the next attempt after `failedAttempt` (1 = just after the
 * first failure). Returns null once the schedule is exhausted — the caller
 * should mark the delivery EXHAUSTED rather than retry forever.
 *
 * Spec §28 says "exponential backoff with jitter" but then gives a fixed
 * table of delays rather than a formula — the fixed table already grows
 * faster than exponentially at first (1m -> 5m is 5x) before flattening, so
 * jitter is layered on top of the table's values rather than deriving the
 * table itself from an exponential formula.
 */
export function getRetryDelayMs(failedAttempt: number, random: () => number = Math.random): number | null {
  const base = RETRY_SCHEDULE_MS[failedAttempt - 1];
  if (base === undefined) return null;
  const jitter = base * JITTER_RATIO * (random() * 2 - 1); // +/- 20%
  return Math.round(base + jitter);
}
