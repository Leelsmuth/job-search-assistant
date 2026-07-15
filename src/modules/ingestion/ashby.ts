import {
  normalizedJobSchema,
  type NormalizedJob,
  type RawJobSource,
  type JobSourceAdapter,
} from "./types";
import { extractRequirementsFromText } from "./extract-requirements";
import { htmlToPlainText, sanitizeJobTitle } from "./html-text";

export type AshbyJob = {
  id: string;
  title: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  publishedAt?: string;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl: string;
  descriptionHtml?: string;
};

type AshbyBoardResponse = {
  jobs: AshbyJob[];
};

function formatBoardName(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapWorkplaceType(job: AshbyJob): "remote" | "hybrid" | "on_site" | "unknown" {
  const wt = (job.workplaceType ?? "").toLowerCase();
  if (job.isRemote || wt === "remote") return "remote";
  if (wt === "hybrid") return "hybrid";
  if (wt === "onsite" || wt === "on_site" || wt === "on-site") return "on_site";
  if (/remote/i.test(job.location ?? "")) return "remote";
  return "unknown";
}

export function normalizeAshbyJob(
  job: AshbyJob,
  companyName: string
): NormalizedJob {
  const description = htmlToPlainText(job.descriptionHtml ?? "");
  const reqs = extractRequirementsFromText(description);

  return normalizedJobSchema.parse({
    company: companyName,
    title: sanitizeJobTitle(job.title),
    location: job.location,
    workplaceType: mapWorkplaceType(job),
    description: description || job.title,
    responsibilities: reqs.responsibilities,
    requiredQualifications: reqs.required,
    preferredQualifications: reqs.preferred,
    technologies: reqs.technologies,
    jobUrl: job.jobUrl,
    sourceJobId: job.id,
    employmentType: job.employmentType,
    datePosted: job.publishedAt,
  });
}

async function fetchAshbyBoard(board: string): Promise<AshbyBoardResponse> {
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${board}`;
  const response = await fetch(apiUrl, {
    headers: { "User-Agent": "JobSearchAssistant/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Ashby board fetch failed: HTTP ${response.status}`);
  }
  return (await response.json()) as AshbyBoardResponse;
}

function extractBoardName(url: string): string | null {
  const apiMatch = url.match(/api\.ashbyhq\.com\/posting-api\/job-board\/([^/?#]+)/i);
  if (apiMatch) return apiMatch[1];

  const jobsMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
  if (jobsMatch) return jobsMatch[1];

  return null;
}

export const ashbyAdapter: JobSourceAdapter = {
  provider: "ashby",

  async detect(input: string) {
    const isAshby =
      /jobs\.ashbyhq\.com/i.test(input) ||
      /api\.ashbyhq\.com\/posting-api\/job-board/i.test(input);
    return {
      confidence: isAshby ? 0.95 : 0,
      reason: isAshby ? "Ashby URL detected" : "Not Ashby",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const url = input.trim();
    const board = extractBoardName(url);
    if (!board) {
      throw new Error("Could not parse Ashby board from URL.");
    }

    const jobMatch = url.match(/jobs\.ashbyhq\.com\/[^/]+\/([a-f0-9-]+)/i);
    const data = await fetchAshbyBoard(board);
    const companyName = formatBoardName(board);

    if (jobMatch) {
      const postingId = jobMatch[1];
      const job = data.jobs.find((j) => j.id === postingId);
      if (!job) {
        throw new Error("Ashby posting not found on board.");
      }
      return {
        provider: "ashby",
        sourceUrl: url,
        sourceJobId: job.id,
        rawText: htmlToPlainText(job.descriptionHtml ?? ""),
        rawPayload: { job, companyName, board },
      };
    }

    const combined = data.jobs
      .map((j) => `## ${j.title}\n${htmlToPlainText(j.descriptionHtml ?? "")}`)
      .join("\n\n");

    return {
      provider: "ashby",
      sourceUrl: url,
      rawText: combined,
      rawPayload: { jobs: data.jobs, companyName, board },
    };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const payload = raw.rawPayload as
      | { job: AshbyJob; companyName?: string }
      | { jobs: AshbyJob[]; companyName?: string; board?: string }
      | undefined;

    if (payload && "job" in payload) {
      return normalizeAshbyJob(
        payload.job,
        payload.companyName ?? "Company"
      );
    }

    if (payload && "jobs" in payload && payload.jobs.length === 1) {
      return normalizeAshbyJob(
        payload.jobs[0],
        payload.companyName ?? formatBoardName(payload.board ?? "Company")
      );
    }

    const reqs = extractRequirementsFromText(htmlToPlainText(raw.rawText));
    return normalizedJobSchema.parse({
      company: payload?.companyName ?? "Ashby Board",
      title: "Multiple Positions",
      description: htmlToPlainText(raw.rawText),
      responsibilities: reqs.responsibilities,
      requiredQualifications: reqs.required,
      preferredQualifications: reqs.preferred,
      technologies: reqs.technologies,
      jobUrl: raw.sourceUrl,
    });
  },
};
