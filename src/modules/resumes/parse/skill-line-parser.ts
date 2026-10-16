import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";
import {
  isKnownSkillToken,
  isSkillCategoryHeading,
  splitGluedToken,
} from "@/modules/resumes/normalize/text-cleanup";

export type ParsedSkill = {
  name: string;
  confidence: number;
  sourceLines: number[];
};

export type ParsedSkillGroup = {
  category: string | null;
  skills: ParsedSkill[];
};

function lineNumber(line: GroupedLine, index: number): number {
  return line.lineNumber ?? index + 1;
}

function skillConfidence(name: string): number {
  if (isKnownSkillToken(name)) return 0.9;
  if (name.split(/\s+/).length <= 3 && name.length <= 32) return 0.68;
  return 0.45;
}

function isSentenceSkill(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 8 || (text.length > 60 && /[.!]/.test(text));
}

function expandSkillToken(token: string): string[] {
  const parts = splitGluedToken(token);
  if (parts.length > 1) return parts.flatMap(expandSkillToken);
  return [token];
}

export function splitSkillLine(text: string): string[] {
  const pieces = text
    .split(/[,;|]/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const skills: string[] = [];
  for (const piece of pieces) {
    const tokens = piece.split(/\s+/).filter(Boolean);
    const expanded = tokens.flatMap(expandSkillToken);
    const dictionaryRun = expanded.every((token) => isKnownSkillToken(token));
    if (dictionaryRun && expanded.length > 1) {
      skills.push(...expanded);
      continue;
    }
    skills.push(expanded.join(" "));
  }

  return skills
    .map((skill) => skill.replace(/[()]+$/g, "").replace(/^[(]+/g, "").trim())
    .filter((skill) => skill.length > 1 && !isSkillCategoryHeading(skill) && !isSentenceSkill(skill));
}

export function parseSkillLines(lines: GroupedLine[]): ParsedSkillGroup[] {
  const groups: ParsedSkillGroup[] = [];
  const pendingCategories: string[] = [];
  let current: ParsedSkillGroup | null = null;

  function ensureGroup(category: string | null): ParsedSkillGroup {
    const existing = groups.find((group) => group.category === category);
    if (existing) return existing;
    const created = { category, skills: [] };
    groups.push(created);
    return created;
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const text = line.text.trim();
    if (!text || /^[-•*–—]\s+/.test(text)) continue;

    const labelled = text.match(/^([A-Za-z][A-Za-z\s/&+-]{1,40}):\s*(.+)$/);
    if (labelled && (labelled[2].includes(",") || isSkillCategoryHeading(labelled[1]))) {
      current = ensureGroup(labelled[1].trim());
      pendingCategories.length = 0;
      for (const name of splitSkillLine(labelled[2])) {
        current.skills.push({
          name,
          confidence: skillConfidence(name),
          sourceLines: [lineNumber(line, index)],
        });
      }
      continue;
    }

    if (isSkillCategoryHeading(text) || (text.endsWith(":") && text.length < 40)) {
      pendingCategories.push(text.replace(/:$/, "").trim());
      current = null;
      continue;
    }

    const names = splitSkillLine(text);
    if (names.length === 0) continue;

    const category = pendingCategories.length > 0 ? pendingCategories.shift() ?? null : current?.category ?? null;
    current = ensureGroup(category);
    for (const name of names) {
      if (current.skills.some((skill) => skill.name.toLowerCase() === name.toLowerCase())) continue;
      current.skills.push({
        name,
        confidence: skillConfidence(name),
        sourceLines: [lineNumber(line, index)],
      });
    }
  }

  return groups.filter((group) => group.skills.length > 0);
}
