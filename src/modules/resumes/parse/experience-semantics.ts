import { DATE_RANGE } from "@/modules/resumes/parse/experience-block-parser";

export const DATE_RANGE_PATTERN =
  /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|\d{1,2})[\s./-]*\d{2,4}\b[\s–—-]+.*\b(?:present|current|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|\d{1,2})[\s./-]*\d{2,4}|\d{2,4})\b/i;

export const JOB_TITLE_PATTERN =
  /\b(?:(?:senior|lead|staff|principal|junior)\s+)?(?:(?:software|frontend|front end|front-end|full stack|fullstack|backend|back end|web|ui|product|full-stack)\s+)?(?:developer|engineer|instructor|architect|consultant|designer|manager)\b/i;

const ACHIEVEMENT_HINT =
  /\b(built|developed|led|designed|implemented|migrated|shipped|improved|reduced|increased|delivered|owned|architected|created|maintained|collaborated|optimized|automated|scaled|mentored|launched|worked|contributed|achieved|architected)\b/i;

export function looksLikeDateRange(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return DATE_RANGE.test(text.trim()) || DATE_RANGE_PATTERN.test(text.trim());
}

export function looksLikeJobTitle(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const trimmed = text.trim();
  if (looksLikeDateRange(trimmed)) return false;
  if (trimmed.length > 80) return false;
  return JOB_TITLE_PATTERN.test(trimmed);
}

export function looksLikeCompanyName(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const trimmed = text.trim();
  if (looksLikeDateRange(trimmed)) return false;
  if (looksLikeJobTitle(trimmed)) return false;
  if (trimmed.endsWith(".")) return false;
  if (ACHIEVEMENT_HINT.test(trimmed) && trimmed.length > 40) return false;
  return trimmed.length >= 2 && trimmed.length <= 120;
}

export function looksLikeAchievement(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const trimmed = text.trim();
  if (looksLikeDateRange(trimmed)) return false;
  return (
    ACHIEVEMENT_HINT.test(trimmed) ||
    (trimmed.length > 35 && /[.!]/.test(trimmed))
  );
}

export function looksLikeLocation(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return /\b(remote|canada|toronto|lagos|ontario|usa|united states)\b/i.test(text.trim());
}
