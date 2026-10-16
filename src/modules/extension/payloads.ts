import { canonicalPageUrl, detectPageProvider, type PageProvider } from "@/modules/extension/urls";

export type ExtensionTrackerBody = {
  company: string;
  title: string;
  jobUrl: string;
  location: string | null;
  workplaceType: "remote" | "hybrid" | "on_site" | null;
  description: string | null;
};

export type ExtensionAppliedBody = {
  jobId: string | null;
  pageUrl: string;
  provider: PageProvider;
  title: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  filled: Array<{ question: string; answer: string }>;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function longText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTrackerPayload(input: unknown): ExtensionTrackerBody {
  const body = record(input);
  if (!body) throw new Error("Enter the company, role, and job URL");
  const company = text(body.company, 160);
  const title = text(body.title, 200);
  const jobUrl = typeof body.jobUrl === "string" ? canonicalPageUrl(body.jobUrl) : null;
  if (!company) throw new Error("Company is required and must be 160 characters or fewer");
  if (!title) throw new Error("Role title is required and must be 200 characters or fewer");
  if (!jobUrl || jobUrl.length > 2000) throw new Error("Enter a valid job URL starting with http:// or https://");
  const workplace = body.workplaceType;
  return {
    company,
    title,
    jobUrl,
    location: text(body.location, 200),
    workplaceType:
      workplace === "remote" || workplace === "hybrid" || workplace === "on_site" ? workplace : null,
    description: longText(body.description, 20000),
  };
}

export function parseAppliedPayload(input: unknown): ExtensionAppliedBody {
  const body = record(input);
  if (!body) throw new Error("Missing application");
  const pageUrl = typeof body.pageUrl === "string" ? canonicalPageUrl(body.pageUrl) : null;
  if (!pageUrl) throw new Error("Enter a valid page URL");
  const jobId = typeof body.jobId === "string" && UUID.test(body.jobId) ? body.jobId : null;
  const provider = detectPageProvider(pageUrl);
  const filled = Array.isArray(body.filled) ? body.filled : [];
  return {
    jobId,
    pageUrl,
    provider: provider === "linkedin" || provider === "indeed" ? "other" : provider,
    title: text(body.title, 200),
    company: text(body.company, 160),
    location: text(body.location, 200),
    description: longText(body.description, 20000),
    filled: filled.slice(0, 40).flatMap((item) => {
      const row = record(item);
      if (!row) return [];
      const question = text(row.question, 300);
      const answer = longText(row.answer, 4000);
      if (!question || !answer) return [];
      return [{ question, answer }];
    }),
  };
}

export function parseFillPayload(input: unknown): { pageUrl: string } {
  const body = record(input);
  const pageUrl = body && typeof body.pageUrl === "string" ? canonicalPageUrl(body.pageUrl) : null;
  if (!pageUrl) throw new Error("Enter a valid page URL");
  return { pageUrl };
}
