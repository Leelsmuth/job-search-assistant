import { normalizedJobSchema, type NormalizedJob, type RawJobSource } from "./types";
import { extractRequirementsFromText } from "./extract-requirements";
import { htmlToPlainText, sanitizeJobTitle } from "./html-text";
import { normalizeAshbyJob, type AshbyJob } from "./ashby";

type GreenhouseJob = {
  id: number;
  title: string;
  location: { name: string };
  absolute_url: string;
  content: string;
  updated_at: string;
  departments: Array<{ name: string }>;
};

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  categories: {
    location?: string;
    team?: string;
    commitment?: string;
  };
  createdAt: number;
};

function formatBoardName(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncateLocation(loc?: string): string | undefined {
  if (!loc) return undefined;
  return loc.length > 200 ? loc.slice(0, 200) : loc;
}

function normalizeGreenhouseJob(
  job: GreenhouseJob,
  companyName: string
): NormalizedJob {
  const description = htmlToPlainText(job.content);
  const reqs = extractRequirementsFromText(description);

  return normalizedJobSchema.parse({
    company: companyName,
    title: sanitizeJobTitle(job.title),
    location: truncateLocation(job.location?.name),
    workplaceType: /remote/i.test(job.location?.name ?? "") ? "remote" : "unknown",
    description,
    responsibilities: reqs.responsibilities,
    requiredQualifications: reqs.required,
    preferredQualifications: reqs.preferred,
    technologies: reqs.technologies,
    jobUrl: job.absolute_url,
    sourceJobId: String(job.id),
    datePosted: job.updated_at,
  });
}

function normalizeLeverPosting(
  posting: LeverPosting,
  companyName: string
): NormalizedJob {
  const plainText = htmlToPlainText(posting.text);
  const reqs = extractRequirementsFromText(plainText);
  const titleLine = plainText.split("\n").map((l) => l.trim()).find(Boolean);

  return normalizedJobSchema.parse({
    company: sanitizeJobTitle(posting.categories.team, companyName),
    title: sanitizeJobTitle(titleLine),
    location: truncateLocation(posting.categories.location),
    workplaceType: /remote/i.test(posting.categories.location ?? "") ? "remote" : "unknown",
    description: plainText,
    responsibilities: reqs.responsibilities,
    requiredQualifications: reqs.required,
    preferredQualifications: reqs.preferred,
    technologies: reqs.technologies,
    jobUrl: posting.hostedUrl,
    sourceJobId: posting.id,
    employmentType: posting.categories.commitment,
    datePosted: new Date(posting.createdAt).toISOString(),
  });
}

export function normalizeGreenhouseBoardJobs(raw: RawJobSource): NormalizedJob[] {
  const payload = raw.rawPayload as { jobs?: GreenhouseJob[]; companyName?: string; board?: string };
  const jobs = payload?.jobs ?? [];
  const companyName =
    payload?.companyName ??
    (payload?.board ? formatBoardName(payload.board) : "Company");

  return jobs.map((job) => normalizeGreenhouseJob(job, companyName));
}

export function normalizeLeverBoardJobs(raw: RawJobSource): NormalizedJob[] {
  const postings = (raw.rawPayload as LeverPosting[] | undefined) ?? [];
  const boardMatch = raw.sourceUrl?.match(/jobs\.lever\.co\/([^/]+)/i);
  const companyName = boardMatch ? formatBoardName(boardMatch[1]) : "Company";

  return postings.map((posting) => normalizeLeverPosting(posting, companyName));
}

export function normalizeAshbyBoardJobs(raw: RawJobSource): NormalizedJob[] {
  const payload = raw.rawPayload as
    | { jobs?: AshbyJob[]; companyName?: string; board?: string }
    | undefined;
  const jobs = payload?.jobs ?? [];
  const companyName =
    payload?.companyName ??
    (payload?.board ? formatBoardName(payload.board) : "Company");

  return jobs.map((job) => normalizeAshbyJob(job, companyName));
}

export function normalizeBoardJobs(raw: RawJobSource): NormalizedJob[] {
  switch (raw.provider) {
    case "greenhouse":
      return normalizeGreenhouseBoardJobs(raw);
    case "lever":
      return normalizeLeverBoardJobs(raw);
    case "ashby":
      return normalizeAshbyBoardJobs(raw);
    default:
      return [];
  }
}
