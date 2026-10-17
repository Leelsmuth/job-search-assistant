import type { WorkdayEducation, WorkdayExperience, WorkdayHistory } from "@/modules/extension/workday/types";
import { emptyWorkdayHistory } from "@/modules/extension/workday/types";

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

export function parseMonthYear(value: string | null | undefined): { month: string; year: string } | null {
  const text = (value ?? "").trim();
  if (!text || /^(present|current|now|ongoing)$/i.test(text)) return null;
  let match = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (match) return { year: match[1], month: match[2].padStart(2, "0") };
  match = text.match(/^(\d{1,2})[-/](\d{4})$/);
  if (match) return { month: match[1].padStart(2, "0"), year: match[2] };
  match = text.match(/^([A-Za-z]+)\.?\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month) return { month, year: match[2] };
  }
  match = text.match(/^(\d{4})$/);
  if (match) return { month: "01", year: match[1] };
  return null;
}

export function isCurrentRole(endDate: string | null | undefined): boolean {
  const text = (endDate ?? "").trim();
  if (!text) return true;
  return /present|current|now|ongoing/i.test(text);
}

function startKey(value: string): number {
  const parsed = parseMonthYear(value);
  if (!parsed) return 0;
  return Number(parsed.year) * 100 + Number(parsed.month);
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export type CandidateHistorySource = {
  experiences?: Array<{
    title?: string | null;
    company?: string | null;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    bullets?: Array<{ text?: string | null }>;
  }>;
  education?: Array<{
    institution?: string | null;
    degree?: string | null;
    field?: string | null;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  skills?: Array<{ name?: string | null }>;
};

function experienceDescription(row: NonNullable<CandidateHistorySource["experiences"]>[number]): string {
  const description = row.description?.trim() ?? "";
  if (description) return clip(description, 4000);
  const bullets = (row.bullets ?? []).map((bullet) => bullet.text?.trim() ?? "").filter(Boolean);
  return clip(bullets.join("\n"), 4000);
}

export function workdayHistoryFromCandidate(source: CandidateHistorySource | null | undefined): WorkdayHistory {
  if (!source) return emptyWorkdayHistory();
  const experiences: WorkdayExperience[] = (source.experiences ?? []).flatMap((row) => {
    const title = row.title?.trim() ?? "";
    const company = row.company?.trim() ?? "";
    if (!title && !company) return [];
    const endDate = row.endDate?.trim() ?? "";
    return [
      {
        title,
        company,
        location: row.location?.trim() ?? "",
        startDate: row.startDate?.trim() ?? "",
        endDate,
        current: isCurrentRole(endDate),
        description: experienceDescription(row),
      },
    ];
  });
  experiences.sort((left, right) => startKey(right.startDate) - startKey(left.startDate));

  const education: WorkdayEducation[] = (source.education ?? []).flatMap((row) => {
    const school = row.institution?.trim() ?? "";
    if (!school) return [];
    return [
      {
        school,
        degree: row.degree?.trim() ?? "",
        field: row.field?.trim() ?? "",
        location: row.location?.trim() ?? "",
        startDate: row.startDate?.trim() ?? "",
        endDate: row.endDate?.trim() ?? "",
      },
    ];
  });
  education.sort((left, right) => startKey(right.endDate || right.startDate) - startKey(left.endDate || left.startDate));

  const skills: string[] = [];
  const seen = new Set<string>();
  for (const skill of source.skills ?? []) {
    const name = skill.name?.trim() ?? "";
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    skills.push(name);
  }

  return { experiences, education, skills };
}
