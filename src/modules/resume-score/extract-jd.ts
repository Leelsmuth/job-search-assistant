import { extractCanonicalSkills } from "@/modules/candidate/skill-dictionary";
import { sanitizeSkills } from "@/modules/candidate/sanitize-skills";
import type {
  ExtractedJobRequirements,
  ExtractedKeyword,
  KeywordImportance,
  ResumeScoreJob,
  SeniorityLevel,
} from "@/modules/resume-score/types";

const SENIORITY: Array<{ level: SeniorityLevel; pattern: RegExp }> = [
  { level: "principal", pattern: /\bprincipal\b/i },
  { level: "staff", pattern: /\bstaff\b/i },
  { level: "lead", pattern: /\b(tech lead|team lead|lead)\b/i },
  { level: "senior", pattern: /\b(senior|sr\.?)\b/i },
  { level: "junior", pattern: /\b(junior|jr\.?)\b/i },
  { level: "intern", pattern: /\b(intern|internship)\b/i },
  { level: "mid", pattern: /\b(mid[\s-]?level|intermediate)\b/i },
];

const QUALIFICATIONS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Bachelor's degree", pattern: /\b(bachelor(?:'s|’s)?|b\.?\s?sc|b\.?\s?s\.?|undergraduate)\b/i },
  { label: "Master's degree", pattern: /\b(master(?:'s|’s)?|m\.?\s?sc|m\.?\s?s\.?)\b/i },
  { label: "PhD", pattern: /\b(ph\.?\s?d|doctorate)\b/i },
  {
    label: "Work authorization",
    pattern: /\b(authorized to work|work authorization|eligible to work|legally authorized|citizen|permanent resident)\b/i,
  },
  { label: "Security clearance", pattern: /\bsecurity clearance\b/i },
];

type Section = "required" | "preferred" | "responsibilities" | "none";

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    result.push(key);
  }
  return result;
}

function heading(line: string): Section | null {
  const trimmed = line.trim().replace(/:$/, "");
  if (!trimmed || trimmed.length > 80) return null;
  const lower = trimmed.toLowerCase();
  if (
    /^(required|requirements|must[\s-]?haves?|minimum qualifications|basic qualifications|qualifications)$/.test(
      lower
    ) ||
    (/(required|must have|minimum qualifications)/.test(lower) && trimmed.length < 60)
  ) {
    return "required";
  }
  if (
    /^(preferred|preferred qualifications|nice to have|nice-to-have|bonus|pluses)$/.test(lower) ||
    (/(preferred|nice to have|bonus)/.test(lower) && trimmed.length < 60)
  ) {
    return "preferred";
  }
  if (
    /^(responsibilities|what you.?ll do|your role|the role)$/.test(lower) ||
    (/responsibilit/.test(lower) && trimmed.length < 60)
  ) {
    return "responsibilities";
  }
  return null;
}

function importanceFor(line: string, section: Section): KeywordImportance | "context" {
  if (section === "required") return "required";
  if (section === "preferred") return "preferred";
  if (/\b(nice to have|preferred|bonus|familiarity with|exposure to)\b/i.test(line)) return "preferred";
  if (/\b(must|required|minimum|proficient|strong experience|experience with)\b/i.test(line)) {
    return "required";
  }
  if (section === "responsibilities") return "context";
  return "context";
}

function yearsIn(text: string): number | null {
  const values: number[] = [];
  const pattern = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*\+?\s*)?years?/gi;
  for (const match of text.matchAll(pattern)) {
    const lower = Number(match[1]);
    if (Number.isFinite(lower) && lower >= 1 && lower <= 30) values.push(lower);
  }
  if (values.length === 0) return null;
  return Math.max(...values);
}

export function extractSeniority(text: string): SeniorityLevel | null {
  for (const entry of SENIORITY) {
    if (entry.pattern.test(text)) return entry.level;
  }
  return null;
}

function pushSkills(bucket: Map<string, KeywordImportance>, skills: string[], importance: KeywordImportance) {
  for (const skill of skills) {
    const current = bucket.get(skill);
    if (current === "required") continue;
    bucket.set(skill, importance);
  }
}

function qualificationLabels(text: string): string[] {
  return QUALIFICATIONS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.label);
}

export function qualificationPattern(label: string): RegExp | null {
  return QUALIFICATIONS.find((entry) => entry.label === label)?.pattern ?? null;
}

/**
 * Pull required and preferred skills, keywords, seniority, years, and must-have
 * qualifications out of a posting. Skills come from the shared dictionary.
 */
export function extractJobRequirements(job: ResumeScoreJob): ExtractedJobRequirements {
  const description = job.description ?? "";
  const lines = description.split(/\n/);
  const skills = new Map<string, KeywordImportance>();
  const requiredChunks: string[] = [];
  const preferredChunks: string[] = [];
  const mustHave: string[] = [];
  let section: Section = "none";

  const takeLine = (line: string, importance: KeywordImportance | "context") => {
    const found = extractCanonicalSkills(line);
    if (importance === "required") {
      pushSkills(skills, found, "required");
      requiredChunks.push(line);
      if (qualificationLabels(line).length > 0 || /\b(must|required|mandatory)\b/i.test(line)) {
        mustHave.push(line.replace(/^[-•*–]\s*/, "").trim());
      }
    } else if (importance === "preferred") {
      pushSkills(skills, found, "preferred");
      preferredChunks.push(line);
    } else if (found.length > 0 && /^[-•*–]\s+/.test(line.trim())) {
      pushSkills(skills, found, "preferred");
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const next = heading(line);
    if (next) {
      section = next;
      continue;
    }
    const inline = line.match(/^(required|must have|preferred|nice to have)\s*:\s*(.+)$/i);
    if (inline) {
      const inlineImportance: KeywordImportance = /preferred|nice/i.test(inline[1]) ? "preferred" : "required";
      takeLine(inline[2], inlineImportance);
      continue;
    }
    takeLine(line, importanceFor(line, section));
  }

  pushSkills(skills, extractCanonicalSkills(job.title), "required");
  pushSkills(skills, sanitizeSkills(job.technologies ?? []), "required");

  for (const text of job.requiredQualifications ?? []) {
    takeLine(text, "required");
  }
  for (const text of job.preferredQualifications ?? []) {
    takeLine(text, "preferred");
  }
  for (const requirement of job.requirements ?? []) {
    const importance: KeywordImportance = requirement.importance === "preferred" ? "preferred" : "required";
    const fromSkill = sanitizeSkills(
      [requirement.normalizedSkill, requirement.text].filter((value): value is string => Boolean(value))
    );
    pushSkills(skills, fromSkill, importance);
    if (requirement.text) takeLine(requirement.text, importance);
  }

  const requiredSkills = [...skills.entries()].filter(([, importance]) => importance === "required").map(([skill]) => skill);
  const preferredSkills = [...skills.entries()]
    .filter(([, importance]) => importance === "preferred")
    .map(([skill]) => skill);

  const requiredText = requiredChunks.join("\n");
  const yearsRequired = yearsIn(requiredText) ?? yearsIn(description);
  const seniority = extractSeniority(job.title) ?? extractSeniority(description);

  const qualificationImportance = new Map<string, KeywordImportance>();
  for (const label of qualificationLabels(requiredText)) qualificationImportance.set(label, "required");
  for (const label of qualificationLabels(preferredChunks.join("\n"))) {
    if (!qualificationImportance.has(label)) qualificationImportance.set(label, "preferred");
  }
  for (const text of job.requiredQualifications ?? []) {
    for (const label of qualificationLabels(text)) qualificationImportance.set(label, "required");
  }

  const keywords: ExtractedKeyword[] = [
    ...requiredSkills.map((term) => ({ term, importance: "required" as const, kind: "skill" as const })),
    ...preferredSkills.map((term) => ({ term, importance: "preferred" as const, kind: "skill" as const })),
    ...[...qualificationImportance.entries()].map(([term, importance]) => ({
      term,
      importance,
      kind: "qualification" as const,
    })),
  ];

  return {
    requiredSkills,
    preferredSkills,
    keywords,
    seniority,
    yearsRequired,
    mustHaveQualifications: unique(mustHave).slice(0, 12),
  };
}
