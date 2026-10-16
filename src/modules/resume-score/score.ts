import { extractCanonicalSkills } from "@/modules/candidate/skill-dictionary";
import { sanitizeSkills } from "@/modules/candidate/sanitize-skills";
import { assessAtsFormat, atsFormatScore } from "@/modules/resume-score/ats-format";
import { extractJobRequirements, extractSeniority, qualificationPattern } from "@/modules/resume-score/extract-jd";
import {
  RESUME_SCORE_WEIGHTS,
  type EvidenceCitation,
  type ExtractedKeyword,
  type MissingKeyword,
  type ResumeScoreDocument,
  type ResumeScoreEvidence,
  type ResumeScoreJob,
  type ResumeScoreProfile,
  type ResumeScoreResult,
  type ResumeSubscores,
  type SeniorityLevel,
} from "@/modules/resume-score/types";

const SENIORITY_RANK: Record<SeniorityLevel, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
  staff: 5,
  principal: 6,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function combineResumeScore(subscores: ResumeSubscores): number {
  const weighted =
    subscores.hardSkills * RESUME_SCORE_WEIGHTS.hardSkills +
    subscores.keywords * RESUME_SCORE_WEIGHTS.keywords +
    subscores.seniority * RESUME_SCORE_WEIGHTS.seniority +
    subscores.experienceYears * RESUME_SCORE_WEIGHTS.experienceYears +
    subscores.atsFormat * RESUME_SCORE_WEIGHTS.atsFormat;
  return clampScore(weighted);
}

function ratio(matched: number, total: number): number {
  if (total <= 0) return 100;
  return clampScore((matched / total) * 100);
}

function skillsIn(text: string): Set<string> {
  return new Set(extractCanonicalSkills(text));
}

function documentHasKeyword(text: string, resumeSkills: Set<string>, keyword: ExtractedKeyword): boolean {
  if (keyword.kind === "skill") return resumeSkills.has(keyword.term);
  const pattern = qualificationPattern(keyword.term);
  return pattern ? pattern.test(text) : false;
}

function citeSkill(term: string, evidence: ResumeScoreEvidence[], profileSkills: string[]): EvidenceCitation | null {
  for (const row of evidence) {
    const found = new Set([
      ...extractCanonicalSkills(row.text),
      ...sanitizeSkills(row.normalizedSkills ?? []),
    ]);
    if (found.has(term)) {
      return { id: row.id, sourceType: row.sourceType, text: row.text };
    }
  }
  if (sanitizeSkills(profileSkills).includes(term)) {
    return { id: null, sourceType: "skill", text: `Profile skill: ${term}` };
  }
  return null;
}

function citeQualification(
  term: string,
  evidence: ResumeScoreEvidence[]
): EvidenceCitation | null {
  const pattern = qualificationPattern(term);
  if (!pattern) return null;
  for (const row of evidence) {
    if (pattern.test(row.text)) {
      return { id: row.id, sourceType: row.sourceType, text: row.text };
    }
  }
  return null;
}

function seniorityScore(
  jobLevel: SeniorityLevel | null,
  resumeLevel: SeniorityLevel | null
): { score: number; reason: string } {
  if (!jobLevel) return { score: 80, reason: "The posting does not state a seniority level." };
  if (!resumeLevel) return { score: 55, reason: "The resume does not show a seniority level to compare." };
  const gap = Math.abs(SENIORITY_RANK[jobLevel] - SENIORITY_RANK[resumeLevel]);
  if (gap === 0) return { score: 100, reason: `Resume seniority matches ${jobLevel}.` };
  if (gap === 1) return { score: 75, reason: `Resume is ${resumeLevel}; the posting asks for ${jobLevel}.` };
  if (gap === 2) return { score: 45, reason: `Resume is ${resumeLevel}; the posting asks for ${jobLevel}.` };
  return { score: 20, reason: `Resume is ${resumeLevel}; the posting asks for ${jobLevel}.` };
}

function yearsScore(required: number | null, actual: number | null): { score: number; reason: string } {
  if (required == null) return { score: 85, reason: "The posting does not state a years requirement." };
  if (actual == null) return { score: 50, reason: "Years of experience are not on the profile." };
  if (actual >= required) return { score: 100, reason: `${actual} years meets the ${required}+ year requirement.` };
  if (actual >= required - 1) {
    return { score: 80, reason: `${actual} years is just under the ${required}+ year requirement.` };
  }
  return {
    score: clampScore((actual / required) * 100),
    reason: `${actual} years is below the ${required}+ year requirement.`,
  };
}

function resumeSeniority(text: string, titles: string[]): SeniorityLevel | null {
  const levels = [extractSeniority(text), ...titles.map((title) => extractSeniority(title))].filter(
    (level): level is SeniorityLevel => level != null
  );
  if (levels.length === 0) return null;
  return levels.sort((a, b) => SENIORITY_RANK[b] - SENIORITY_RANK[a])[0];
}

function yearsFromText(text: string): number | null {
  const match = text.match(/(\d{1,2})\s*\+?\s*years/i);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 40 ? value : null;
}

export function scoreResumeMatch(
  job: ResumeScoreJob,
  document: ResumeScoreDocument,
  profile: ResumeScoreProfile = {}
): ResumeScoreResult {
  const extracted = extractJobRequirements(job);
  const text = document.text ?? "";
  const resumeSkills = skillsIn(text);
  const evidence = profile.evidence ?? [];
  const profileSkills = profile.skills ?? [];

  const requiredMatched = extracted.requiredSkills.filter((skill) => resumeSkills.has(skill));
  const hardSkills = ratio(requiredMatched.length, extracted.requiredSkills.length);
  const hardReason =
    extracted.requiredSkills.length === 0
      ? "No required skills were extracted from the posting."
      : `${requiredMatched.length} of ${extracted.requiredSkills.length} required skills are on the resume.`;

  const present: string[] = [];
  const missing: MissingKeyword[] = [];
  for (const keyword of extracted.keywords) {
    if (documentHasKeyword(text, resumeSkills, keyword)) {
      present.push(keyword.term);
      continue;
    }
    const citation =
      keyword.kind === "skill"
        ? citeSkill(keyword.term, evidence, profileSkills)
        : citeQualification(keyword.term, evidence);
    missing.push({ ...keyword, evidence: citation });
  }

  const keywordScore = ratio(present.length, extracted.keywords.length);
  const keywordReason =
    extracted.keywords.length === 0
      ? "No keywords were extracted from the posting."
      : `${present.length} of ${extracted.keywords.length} posting keywords are on the resume.`;

  const seniority = seniorityScore(
    extracted.seniority,
    resumeSeniority(text, profile.titles ?? [])
  );
  const years = yearsScore(
    extracted.yearsRequired,
    profile.yearsExperience ?? yearsFromText(text)
  );
  const checks = assessAtsFormat(document);
  const atsFormat = atsFormatScore(checks);
  const atsReason = `${checks.filter((check) => check.passed).length} of ${checks.length} ATS checks passed.`;

  const subscores: ResumeSubscores = {
    hardSkills,
    keywords: keywordScore,
    seniority: seniority.score,
    experienceYears: years.score,
    atsFormat,
  };

  const add = missing.filter((item) => item.evidence != null).sort((a, b) => a.term.localeCompare(b.term));
  const gaps = missing.filter((item) => item.evidence == null).sort((a, b) => a.term.localeCompare(b.term));

  return {
    overall: combineResumeScore(subscores),
    subscores,
    reasons: {
      hardSkills: hardReason,
      keywords: keywordReason,
      seniority: seniority.reason,
      experienceYears: years.reason,
      atsFormat: atsReason,
    },
    checks,
    extracted,
    present: [...new Set(present)].sort((a, b) => a.localeCompare(b)),
    add,
    gaps,
  };
}
