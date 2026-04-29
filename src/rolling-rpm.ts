/**
 * Rolling tempo (reps/min) over the last sliding window — same semantics as ChallengeTracker.computeCurrentTempo.
 * Window length is min(60s, elapsed session time since sessionStartMs).
 */
export function computeRollingRpm(
  repTimestamps: readonly number[],
  sessionStartMs: number,
  nowMs: number
): number {
  if (repTimestamps.length === 0) return 0;

  const windowMs = Math.min(60_000, nowMs - sessionStartMs);
  if (windowMs <= 0) return 0;

  const windowStart = nowMs - windowMs;
  let count = 0;
  for (let i = repTimestamps.length - 1; i >= 0; i--) {
    if (repTimestamps[i] >= windowStart) count++;
    else break;
  }

  return count * (60_000 / windowMs);
}
