/** Small enough that a clearly better fit still ranks first. */
export const FRESHNESS_BONUS_MAX = 3;
const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Decaying bonus for a posting age. 0 once the job is a week old.
 * Apply only after eligibility and minimum-fit filters.
 */
export function freshnessBonus(postedAt: Date | null | undefined, now: Date): number {
  if (!postedAt || Number.isNaN(postedAt.getTime())) return 0;
  const ageMs = now.getTime() - postedAt.getTime();
  if (ageMs <= 0) return FRESHNESS_BONUS_MAX;
  if (ageMs >= FRESHNESS_WINDOW_MS) return 0;
  return FRESHNESS_BONUS_MAX * (1 - ageMs / FRESHNESS_WINDOW_MS);
}

export function freshnessRankScore(
  fitScore: number,
  postedAt: Date | null | undefined,
  now: Date
): number {
  return fitScore + freshnessBonus(postedAt, now);
}
