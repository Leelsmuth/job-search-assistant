import { extractCanonicalSkills } from "@/modules/candidate/skill-dictionary";
import { sanitizeSkills } from "@/modules/candidate/sanitize-skills";
import { fuzzyMatchSource } from "@/modules/resumes/parse/verify-parsed-resume";
import type {
  EvidenceCitation,
  RawResumeSuggestion,
  ResumeScoreEvidence,
  ResumeSuggestion,
} from "@/modules/resume-score/types";

const MAX_SUGGESTION_LENGTH = 600;

function evidenceSkills(row: Pick<ResumeScoreEvidence, "text" | "normalizedSkills">): Set<string> {
  return new Set([...extractCanonicalSkills(row.text), ...sanitizeSkills(row.normalizedSkills ?? [])]);
}

export function supportedSkillsFromEvidence(
  profileSkills: readonly string[] | null | undefined,
  evidence: readonly ResumeScoreEvidence[]
): Set<string> {
  const supported = new Set(sanitizeSkills(profileSkills ?? []));
  for (const row of evidence) {
    for (const skill of evidenceSkills(row)) supported.add(skill);
  }
  return supported;
}

function citationFor(term: string, evidence: readonly ResumeScoreEvidence[]): EvidenceCitation | null {
  for (const row of evidence) {
    const matched = evidenceSkills(row).has(term) || fuzzyMatchSource(term, row.text) !== "none";
    if (!matched) continue;
    return { id: row.id, sourceType: row.sourceType, text: row.text };
  }
  return null;
}

function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => match[0]);
}

/**
 * Keep a rewrite only when every skill it adds is already in the profile.
 * Canonical skills are checked against evidence text the same way the resume
 * parser checks a field against its source lines. Skills with no evidence are dropped.
 */
export function recheckStoredSuggestions(
  suggestions: readonly ResumeSuggestion[],
  input: {
    evidence: readonly ResumeScoreEvidence[];
    profileSkills?: readonly string[] | null;
  }
): ResumeSuggestion[] {
  return finalizeResumeSuggestions(
    suggestions.map((suggestion) => ({
      bulletId: suggestion.bulletId,
      originalText: suggestion.originalText,
      suggestedText: suggestion.suggestedText,
      keywords: suggestion.keywords,
      evidenceIds: suggestion.evidence.flatMap((item) => (item.id ? [item.id] : [])),
    })),
    {
      bullets: suggestions.map((suggestion) => ({
        id: suggestion.bulletId,
        text: suggestion.originalText,
      })),
      evidence: input.evidence,
      profileSkills: input.profileSkills,
    }
  );
}

export function finalizeResumeSuggestions(
  raw: readonly RawResumeSuggestion[],
  input: {
    bullets: ReadonlyArray<{ id: string; text: string }>;
    evidence: readonly ResumeScoreEvidence[];
    profileSkills?: readonly string[] | null;
  }
): ResumeSuggestion[] {
  const bullets = new Map(input.bullets.map((bullet) => [bullet.id, bullet.text.trim()]));
  const supported = supportedSkillsFromEvidence(input.profileSkills, input.evidence);
  const profileSkillList = sanitizeSkills(input.profileSkills ?? []);
  const kept: ResumeSuggestion[] = [];

  for (const suggestion of raw) {
    const original = bullets.get(suggestion.bulletId);
    const next = suggestion.suggestedText.trim();
    if (!original || !next || next === original || next.length > MAX_SUGGESTION_LENGTH) continue;

    const claimed = sanitizeSkills(suggestion.keywords);
    if (claimed.length === 0 || claimed.some((skill) => !supported.has(skill))) continue;

    const originalSkills = new Set(extractCanonicalSkills(original));
    const addedSkills = extractCanonicalSkills(next).filter((skill) => !originalSkills.has(skill));
    if (addedSkills.some((skill) => !supported.has(skill))) continue;

    const woven = [...new Set([...claimed, ...addedSkills])].filter((skill) => !originalSkills.has(skill));
    if (woven.length === 0 || woven.some((skill) => !supported.has(skill))) continue;

    const citations: EvidenceCitation[] = [];
    let grounded = true;
    for (const skill of woven) {
      const citation = citationFor(skill, input.evidence);
      if (citation) {
        citations.push(citation);
        continue;
      }
      if (profileSkillList.includes(skill)) {
        citations.push({ id: null, sourceType: "skill", text: `Profile skill: ${skill}` });
        continue;
      }
      grounded = false;
      break;
    }
    if (!grounded) continue;

    const allowedNumbers = new Set([
      ...numbersIn(original),
      ...citations.flatMap((citation) => numbersIn(citation.text)),
    ]);
    if (numbersIn(next).some((value) => !allowedNumbers.has(value))) continue;

    kept.push({
      bulletId: suggestion.bulletId,
      originalText: original,
      suggestedText: next,
      keywords: woven,
      evidence: citations,
    });
  }

  return kept;
}
