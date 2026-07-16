/** Lines that should never become tailoring inputs (contact/header noise). */
const EXCLUDED_PATTERNS = [
  /^[\w.+-]+@[\w.-]+\.\w+$/, // email only line
  /@\w+\.\w+/, // email embedded
  /\b(linkedin\.com|github\.com|portfolio)\b/i,
  /^\+?\d[\d\s().-]{7,}\d$/, // phone-only line
  /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
  /^(https?:\/\/|www\.)/i,
  /^(resume|curriculum vitae|cv)$/i,
];

const ACHIEVEMENT_HINT =
  /\b(built|developed|led|designed|implemented|migrated|shipped|improved|reduced|increased|delivered|owned|architected|created|maintained|collaborated|optimized|automated|scaled|mentored|launched)\b/i;

const MIN_BULLET_LENGTH = 28;

/**
 * Resume bullets eligible for job-specific tailoring — achievement statements only,
 * not contact info, headers, or bare titles.
 */
export function isTailorableBullet(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_BULLET_LENGTH) return false;
  if (EXCLUDED_PATTERNS.some((p) => p.test(trimmed))) return false;

  // Title-only / header lines (no verb, short, often "Senior Engineer" or "Name | Title")
  if (!ACHIEVEMENT_HINT.test(trimmed) && trimmed.split(/\s+/).length < 8) {
    return false;
  }

  // Mostly punctuation or pipe-separated header (Name | Title | Email)
  const pipeParts = trimmed.split("|").map((p) => p.trim());
  if (pipeParts.length >= 2 && pipeParts.every((p) => p.length < 40) && !ACHIEVEMENT_HINT.test(trimmed)) {
    return false;
  }

  return true;
}

export function scoreBulletForJob(bulletText: string, jobDescription: string): number {
  const bulletLower = bulletText.toLowerCase();
  const jobLower = jobDescription.toLowerCase();
  let score = 0;

  const words = bulletLower.split(/\W+/).filter((w) => w.length > 3);
  for (const word of words) {
    if (jobLower.includes(word)) score += 1;
  }

  if (ACHIEVEMENT_HINT.test(bulletText)) score += 2;
  if (/\d+%|\d+x|\$\d|#\d|\d+\+/.test(bulletText)) score += 1; // metrics

  return score;
}

export function selectTailoringBullets(
  bullets: Array<{ id: string; text: string }>,
  jobDescription: string,
  limit = 8
): Array<{ id: string; text: string }> {
  return bullets
    .filter((b) => isTailorableBullet(b.text))
    .sort(
      (a, b) =>
        scoreBulletForJob(b.text, jobDescription) - scoreBulletForJob(a.text, jobDescription)
    )
    .slice(0, limit);
}
