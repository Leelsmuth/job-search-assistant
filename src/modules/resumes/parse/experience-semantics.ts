import { DATE_RANGE } from "@/modules/resumes/parse/experience-block-parser";
import { isKnownSkillToken, stripZeroWidth } from "@/modules/resumes/normalize/text-cleanup";

export const DATE_RANGE_PATTERN =
  /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|\d{1,2})[\s./-]*\d{2,4}\b[\s–—-]+.*\b(?:present|current|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|\d{1,2})[\s./-]*\d{2,4}|\d{2,4})\b/i;

export const JOB_TITLE_PATTERN =
  /\b(?:(?:senior|lead|staff|principal|junior)\s+)?(?:(?:software|frontend|front end|front-end|full stack|fullstack|backend|back end|web|ui|product|full-stack)\s+)?(?:developer|engineer|instructor|architect|consultant|designer|manager)\b/i;

const ACHIEVEMENT_HINT =
  /\b(built|developed|led|designed|implemented|migrated|shipped|improved|reduced|increased|delivered|owned|architected|created|maintained|collaborated|optimized|automated|scaled|mentored|launched|worked|contributed|achieved|architected)\b/i;

export function cleanResumeName(text: string): string {
  return stripZeroWidth(text).replace(/\s+/g, " ").trim();
}

const COMPANY_STOPWORD =
  /^(of|and|the|a|an|to|for|in|on|by|at|or|with|using|including)$/i;

export function looksLikeBulletContinuation(text: string | null | undefined): boolean {
  const trimmed = cleanResumeName(text ?? "");
  if (!trimmed) return false;
  if (/^[a-z(]/.test(trimmed)) return true;
  if (/^(and|with|for|to|using|including|across)\b/i.test(trimmed)) return true;
  return false;
}

export function isRejectedCompanyToken(text: string | null | undefined): boolean {
  const trimmed = cleanResumeName(text ?? "");
  if (!trimmed) return true;
  if (COMPANY_STOPWORD.test(trimmed)) return true;
  if (isKnownSkillToken(trimmed)) return true;
  if (looksLikeBulletContinuation(trimmed)) return true;
  return false;
}

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
  const trimmed = cleanResumeName(text ?? "");
  if (!trimmed) return false;
  if (looksLikeDateRange(trimmed)) return false;
  if (looksLikeJobTitle(trimmed)) return false;
  if (looksLikeLocation(trimmed) && trimmed.split(/\s+/).length <= 4) return false;
  if (isRejectedCompanyToken(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  if (ACHIEVEMENT_HINT.test(trimmed) && trimmed.length > 40) return false;
  return trimmed.length >= 2 && trimmed.length <= 80;
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
  return /\b(remote|canada|toronto|ottawa|lagos|ontario|usa|united states)\b/i.test(text.trim());
}
