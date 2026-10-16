import { extractCanonicalSkills } from "@/modules/candidate/skill-dictionary";

/**
 * Turn parsed resume "skills" into a canonical tech list.
 * Sentences, bullets, and company names are discarded. Known technologies
 * mentioned inside a bullet are kept (so "• Architected React…" becomes React).
 */
export function sanitizeSkills(raw: readonly string[] | null | undefined): string[] {
  const found = new Set<string>();
  for (const entry of raw ?? []) {
    if (typeof entry !== "string") continue;
    const text = entry.replace(/^[•\-\u2022*\s]+/, "").trim();
    if (!text) continue;
    for (const skill of extractCanonicalSkills(text)) found.add(skill);
  }
  return [...found];
}

export function skillsLookCorrupted(raw: readonly string[]): boolean {
  if (raw.length === 0) return false;
  const cleaned = sanitizeSkills(raw);
  if (cleaned.length === 0) return raw.some((entry) => entry.trim().length > 0);
  const long = raw.filter((entry) => entry.trim().length > 48 || /[•\u2022]/.test(entry));
  return long.length > 0 || cleaned.length < raw.length / 2;
}
