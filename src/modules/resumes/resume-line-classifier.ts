const CONTACT_PATTERNS = [
  /^[\w.+-]+@[\w.-]+\.\w+$/,
  /@\w+\.\w+/,
  /\b(linkedin\.com|github\.com)\b/i,
  /^\+?\d[\d\s().-]{7,}\d$/,
  /^(https?:\/\/|www\.)/i,
];

const SECTION_HEADER =
  /^(experience|work experience|employment|education|skills|projects|summary|contact|certifications|technical skills)$/i;

const BULLET_PREFIX = /^[-•*–—]\s+/;
const ACHIEVEMENT_HINT =
  /\b(built|developed|led|designed|implemented|migrated|shipped|improved|reduced|increased|delivered|owned|architected|created|maintained|collaborated|optimized|automated|scaled|mentored|launched|worked|contributed|achieved)\b/i;

export function isContactOrHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed.length < 3) return true;
  if (CONTACT_PATTERNS.some((p) => p.test(trimmed))) return true;
  if (SECTION_HEADER.test(trimmed)) return true;
  if (/^\d{4}\s*[-–—]\s*(present|\d{4})/i.test(trimmed)) return true;
  return false;
}

export function isLikelyExperienceBullet(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || isContactOrHeaderLine(trimmed)) return false;
  if (BULLET_PREFIX.test(trimmed)) return true;
  if (ACHIEVEMENT_HINT.test(trimmed) && trimmed.length >= 20) return true;
  return false;
}

export function normalizeBulletText(line: string): string {
  return line.trim().replace(BULLET_PREFIX, "").trim();
}

export function filterExtractedBullets(lines: string[]): string[] {
  return lines
    .map(normalizeBulletText)
    .filter((line) => line.length > 0 && !isContactOrHeaderLine(line))
    .filter((line) => isLikelyExperienceBullet(line) || line.length >= 40);
}
