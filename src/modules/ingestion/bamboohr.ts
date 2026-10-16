import { fetchTenant, MAX_DETAIL_FETCHES, pauseBetweenDetails, titleDetailRank } from "./ats-http";
import { annualSalary, listingToNormalizedJob } from "./listing-job";
import type { JobSourceAdapter, NormalizedJob, RawJobSource } from "./types";

const HOST = /^[a-z0-9-]+\.bamboohr\.com$/i;

export type BambooListJob = {
  id?: string;
  jobOpeningName?: string;
  location?: { city?: string; state?: string };
  isRemote?: boolean | null;
  locationType?: string;
  employmentStatusLabel?: string;
};

export type BambooDetail = {
  result?: {
    jobOpening?: {
      jobOpeningName?: string;
      jobOpeningShareUrl?: string;
      departmentLabel?: string;
      employmentStatusLabel?: string;
      location?: { city?: string; state?: string };
      description?: string;
      compensation?: string;
      datePosted?: string;
      locationType?: string;
    };
  };
};

function money(text: string | undefined): { min?: number; max?: number; currency?: string } {
  if (!text) return {};
  const currency = /usd|\$\s*us/i.test(text) ? "USD" : "CAD";
  const amounts = [...text.matchAll(/\$?\s*([0-9][0-9,]*)/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => annualSalary(value) != null);
  return { min: amounts[0], max: amounts[1] ?? amounts[0], currency };
}

export function normalizeBambooDetail(detail: BambooDetail, companyName: string, id: string): NormalizedJob {
  const opening = detail.result?.jobOpening ?? {};
  const place = [opening.location?.city, opening.location?.state].filter(Boolean).join(", ");
  const remote = opening.locationType === "1" || /remote/i.test(place);
  const pay = money(opening.compensation);
  return listingToNormalizedJob({
    company: companyName,
    title: opening.jobOpeningName || "Role",
    location: place,
    workplaceType: remote ? "remote" : "unknown",
    description: opening.description,
    jobUrl: opening.jobOpeningShareUrl,
    sourceJobId: id,
    datePosted: opening.datePosted,
    employmentType: opening.employmentStatusLabel,
    salaryMin: pay.min,
    salaryMax: pay.max,
    salaryCurrency: pay.currency,
    provider: "bamboohr",
  });
}

export async function fetchBambooBoard(company: string, companyName: string): Promise<NormalizedJob[]> {
  const listText = await fetchTenant(`https://${company}.bamboohr.com/careers/list`, HOST);
  const list = JSON.parse(listText) as { result?: BambooListJob[] };
  const ordered = [...(list.result ?? [])].sort(
    (a, b) => titleDetailRank(a.jobOpeningName ?? "") - titleDetailRank(b.jobOpeningName ?? "")
  );
  const jobs: NormalizedJob[] = [];
  for (const item of ordered.slice(0, MAX_DETAIL_FETCHES)) {
    if (!item.id) continue;
    const detailText = await fetchTenant(`https://${company}.bamboohr.com/careers/${item.id}/detail`, HOST);
    jobs.push(normalizeBambooDetail(JSON.parse(detailText) as BambooDetail, companyName, item.id));
    await pauseBetweenDetails();
  }
  return jobs;
}

export const bambooHrAdapter: JobSourceAdapter = {
  provider: "bamboohr",

  async detect(input: string) {
    const match = /bamboohr\.com/i.test(input);
    return {
      confidence: match ? 0.96 : 0,
      reason: match ? "BambooHR URL detected" : "Not BambooHR",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const { normalizeBoardUrl } = await import("./board-url");
    const parsed = normalizeBoardUrl(input, "bamboohr");
    const jobs = await fetchBambooBoard(parsed.boardSlug, parsed.boardSlug);
    return {
      provider: "bamboohr",
      sourceUrl: parsed.boardUrl,
      rawText: jobs.map((job) => job.title).join("\n"),
      rawPayload: { jobs, companyName: jobs[0]?.company },
    };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const jobs = (raw.rawPayload as { jobs?: NormalizedJob[] } | undefined)?.jobs ?? [];
    if (jobs[0]) return jobs[0];
    return listingToNormalizedJob({
      company: "BambooHR",
      title: "Multiple Positions",
      description: raw.rawText,
      provider: "bamboohr",
    });
  },
};
