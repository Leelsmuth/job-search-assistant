import {
  fetchAllowlisted,
  MAX_DETAIL_FETCHES,
  pauseBetweenDetails,
  titleDetailRank,
} from "./ats-http";
import { listingToNormalizedJob } from "./listing-job";
import { providerPostedDate } from "./posted-date";
import type { JobSourceAdapter, NormalizedJob, RawJobSource } from "./types";

const HOST = /^api\.rippling\.com$/i;

export type RipplingListJob = {
  uuid?: string;
  name?: string;
  url?: string;
  department?: { label?: string } | string;
  workLocation?: { label?: string } | string;
};

export type RipplingDetail = RipplingListJob & {
  description?: { company?: string; role?: string } | string;
  createdAt?: string;
  postedDate?: string;
};

function locationLabel(job: RipplingListJob): string {
  const value = job.workLocation;
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.label ?? "";
}

function departmentLabel(job: RipplingListJob): string {
  const value = job.department;
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.label ?? "";
}

function descriptionText(detail: RipplingDetail): string {
  const value = detail.description;
  if (!value) return "";
  if (typeof value === "string") return value;
  return [value.role, value.company].filter(Boolean).join("\n\n");
}

const RIPPLING_US_ONLY = /\b(?:united states|u\.s\.a?\.?|usa)\b/i;
const RIPPLING_CANADA = /\b(?:canada|toronto|ontario|vancouver|montr[eé]al|gta)\b/i;
const RIPPLING_WORLDWIDE = /\b(?:worldwide|anywhere|global)\b/i;
const RIPPLING_OTHER_COUNTRY =
  /\b(?:united kingdom|uk|germany|france|india|australia|ireland|netherlands|spain|sweden|denmark|norway|finland|brazil|mexico|japan|singapore)\b/i;

/** Canada, worldwide remote, or an unspecified remote label. US-only remote stays off the detail budget. */
export function ripplingLocationEligible(location: string): boolean {
  const text = location.trim();
  if (!text) return false;
  if (RIPPLING_US_ONLY.test(text) && !RIPPLING_CANADA.test(text)) return false;
  if (RIPPLING_CANADA.test(text) || RIPPLING_WORLDWIDE.test(text)) return true;
  return /\bremote\b/i.test(text) && !RIPPLING_OTHER_COUNTRY.test(text);
}

export function normalizeRipplingJob(detail: RipplingDetail, companyName: string): NormalizedJob {
  const location = locationLabel(detail);
  const workplaceType = /remote/i.test(location) ? "remote" : /hybrid/i.test(location) ? "hybrid" : "unknown";
  return listingToNormalizedJob({
    company: companyName,
    title: (detail.name ?? "Role").trim(),
    location,
    workplaceType,
    description: descriptionText(detail) || `${detail.name ?? "Role"} — ${departmentLabel(detail)} — ${location}`,
    jobUrl: detail.url,
    sourceJobId: detail.uuid,
    employmentType: departmentLabel(detail),
    datePosted: providerPostedDate("rippling", detail),
    provider: "rippling",
  });
}

export async function fetchRipplingBoard(slug: string, companyName: string): Promise<NormalizedJob[]> {
  const listResponse = await fetchAllowlisted(
    `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(slug)}/jobs`,
    HOST
  );
  const listed = (await listResponse.json()) as RipplingListJob[];
  const candidates = (Array.isArray(listed) ? listed : [])
    .filter((job) => ripplingLocationEligible(locationLabel(job)))
    .sort((a, b) => titleDetailRank(a.name ?? "") - titleDetailRank(b.name ?? ""));
  const jobs: NormalizedJob[] = [];
  for (const item of candidates.slice(0, MAX_DETAIL_FETCHES)) {
    if (!item.uuid) continue;
    const detailResponse = await fetchAllowlisted(
      `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(item.uuid)}`,
      HOST
    );
    jobs.push(normalizeRipplingJob((await detailResponse.json()) as RipplingDetail, companyName));
    await pauseBetweenDetails();
  }
  return jobs;
}

export const ripplingAdapter: JobSourceAdapter = {
  provider: "rippling",

  async detect(input: string) {
    const match = /rippling\.com/i.test(input);
    return {
      confidence: match ? 0.96 : 0,
      reason: match ? "Rippling URL detected" : "Not Rippling",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const { normalizeBoardUrl } = await import("./board-url");
    const parsed = normalizeBoardUrl(input, "rippling");
    const jobs = await fetchRipplingBoard(parsed.boardSlug, parsed.boardSlug);
    return {
      provider: "rippling",
      sourceUrl: parsed.boardUrl,
      rawText: jobs.map((job) => job.title).join("\n"),
      rawPayload: { jobs },
    };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const jobs = (raw.rawPayload as { jobs?: NormalizedJob[] } | undefined)?.jobs ?? [];
    if (jobs[0]) return jobs[0];
    return listingToNormalizedJob({
      company: "Rippling",
      title: "Multiple Positions",
      description: raw.rawText,
      provider: "rippling",
    });
  },
};
