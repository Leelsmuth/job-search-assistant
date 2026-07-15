import {
  normalizedJobSchema,
  type NormalizedJob,
  type RawJobSource,
  type JobSourceAdapter,
} from "./types";
import { extractRequirementsFromText } from "./extract-requirements";
import { htmlToPlainText, sanitizeJobTitle } from "./html-text";
import { extractGreenhouseBoardSlug, normalizeBoardUrl } from "./board-url";

type GreenhouseJob = {
  id: number;
  title: string;
  location: { name: string };
  absolute_url: string;
  content: string;
  updated_at: string;
  departments: Array<{ name: string }>;
};

type GreenhouseBoard = {
  name: string;
};

export const greenhouseAdapter: JobSourceAdapter = {
  provider: "greenhouse",

  async detect(input: string) {
    const isGreenhouse =
      /greenhouse\.io/i.test(input) ||
      /boards-api\.greenhouse\.io/i.test(input) ||
      /job-boards\.greenhouse\.io/i.test(input);
    return {
      confidence: isGreenhouse ? 0.95 : 0,
      reason: isGreenhouse ? "Greenhouse URL detected" : "Not Greenhouse",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const url = input.trim();

    const jobMatch = url.match(/greenhouse\.io\/[^/]+\/jobs\/(\d+)/i);
    if (jobMatch) {
      const board = extractGreenhouseBoardSlug(url);
      if (board) {
        const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobMatch[1]}`;
        const [jobResponse, boardResponse] = await Promise.all([
          fetch(apiUrl),
          fetch(`https://boards-api.greenhouse.io/v1/boards/${board}`),
        ]);
        if (jobResponse.ok) {
          const job = (await jobResponse.json()) as GreenhouseJob;
          const boardInfo = boardResponse.ok
            ? ((await boardResponse.json()) as GreenhouseBoard)
            : null;
          return {
            provider: "greenhouse",
            sourceUrl: url,
            sourceJobId: String(job.id),
            rawText: job.content,
            rawPayload: { job, companyName: boardInfo?.name ?? formatBoardName(board), board },
          };
        }
      }
    }

    let board: string | null = null;
    try {
      board = normalizeBoardUrl(url, "greenhouse").boardSlug;
    } catch {
      board = extractGreenhouseBoardSlug(url);
    }
    if (board) {
      const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = (await response.json()) as { jobs: GreenhouseJob[] };
        const combined = data.jobs
          .map((j) => `## ${j.title}\n${j.content}`)
          .join("\n\n");
        return {
          provider: "greenhouse",
          sourceUrl: url,
          rawText: combined,
          rawPayload: { ...data, board, companyName: formatBoardName(board) },
        };
      }
    }

    throw new Error("Could not fetch Greenhouse job. Check board URL or paste description.");
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const payload = raw.rawPayload as
      | { job: GreenhouseJob; companyName?: string; board?: string }
      | GreenhouseJob
      | { jobs: GreenhouseJob[] }
      | undefined;

    if (payload && "job" in payload) {
      const { job, companyName, board } = payload;
      const description = htmlToPlainText(job.content);
      const reqs = extractRequirementsFromText(description);
      return normalizedJobSchema.parse({
        company: companyName ?? (board ? formatBoardName(board) : "Company"),
        title: sanitizeJobTitle(job.title),
        location: job.location?.name,
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

    if (payload && "title" in payload) {
      const job = payload as GreenhouseJob;
      const description = htmlToPlainText(job.content);
      const reqs = extractRequirementsFromText(description);
      return normalizedJobSchema.parse({
        company: job.departments[0]?.name ?? "Company",
        title: sanitizeJobTitle(job.title),
        location: job.location?.name,
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

    const reqs = extractRequirementsFromText(htmlToPlainText(raw.rawText));
    return normalizedJobSchema.parse({
      company: "Greenhouse Board",
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

function formatBoardName(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
