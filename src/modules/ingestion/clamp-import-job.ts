import type { NormalizedJob } from "./types";

const QUALIFICATION_MAX = 2_000;
const QUALIFICATION_ITEMS = 100;
const TECHNOLOGY_MAX = 100;
const TECHNOLOGY_ITEMS = 50;
const DESCRIPTION_MAX = 50_000;

function splitBounded(text: string, maxLen: number): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(" ", maxLen);
    if (cut < Math.floor(maxLen / 2)) cut = maxLen;
    const piece = rest.slice(0, cut).trim();
    if (piece) parts.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function clampParagraphs(
  values: string[] | undefined,
  maxLen: number,
  maxItems: number
): string[] {
  const out: string[] = [];
  for (const value of values ?? []) {
    if (out.length >= maxItems) break;
    for (const piece of splitBounded(value, maxLen)) {
      if (out.length >= maxItems) break;
      out.push(piece);
    }
  }
  return out;
}

function clampTokens(values: string[] | undefined, maxLen: number, maxItems: number): string[] {
  const out: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.push(trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed);
    if (out.length >= maxItems) break;
  }
  return out;
}

function clampOptional(value: string | undefined, maxLen: number): string | undefined {
  if (value == null) return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/** Fit extracted jobs to confirmJobImportSchema without rejecting the whole board poll. */
export function clampJobForImport(job: NormalizedJob): NormalizedJob {
  const description =
    job.description.length > DESCRIPTION_MAX
      ? job.description.slice(0, DESCRIPTION_MAX)
      : job.description;

  return {
    ...job,
    company: job.company.slice(0, 200),
    title: job.title.slice(0, 120),
    location: clampOptional(job.location, 200),
    description,
    responsibilities: clampParagraphs(job.responsibilities, QUALIFICATION_MAX, QUALIFICATION_ITEMS),
    requiredQualifications: clampParagraphs(
      job.requiredQualifications,
      QUALIFICATION_MAX,
      QUALIFICATION_ITEMS
    ),
    preferredQualifications: clampParagraphs(
      job.preferredQualifications,
      QUALIFICATION_MAX,
      QUALIFICATION_ITEMS
    ),
    technologies: clampTokens(job.technologies, TECHNOLOGY_MAX, TECHNOLOGY_ITEMS),
    experienceRequirements: clampOptional(job.experienceRequirements, QUALIFICATION_MAX),
    educationRequirements: clampOptional(job.educationRequirements, QUALIFICATION_MAX),
    sourceJobId: clampOptional(job.sourceJobId, 200),
    datePosted: clampOptional(job.datePosted, 50),
    employmentType: clampOptional(job.employmentType, 100),
  };
}
