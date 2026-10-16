import { fetchAllowlisted, MAX_DETAIL_FETCHES, pauseBetweenDetails, titleDetailRank } from "./ats-http";
import { listingToNormalizedJob } from "./listing-job";
import type { JobSourceAdapter, NormalizedJob, RawJobSource } from "./types";

const HOST = /^api\.smartrecruiters\.com$/i;

export type SmartRecruitersListJob = {
  id?: string;
  name?: string;
  releasedDate?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    fullLocation?: string;
    remote?: boolean;
    hybrid?: boolean;
  };
  typeOfEmployment?: { label?: string };
};

export type SmartRecruitersDetail = SmartRecruitersListJob & {
  company?: { name?: string; identifier?: string };
  applyUrl?: string;
  postingUrl?: string;
  jobAd?: {
    sections?: Record<string, { text?: string; title?: string } | undefined>;
  };
};

function sectionText(detail: SmartRecruitersDetail): string {
  const sections = detail.jobAd?.sections ?? {};
  return ["jobDescription", "qualifications", "additionalInformation", "companyDescription"]
    .map((key) => sections[key]?.text ?? "")
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeSmartRecruitersJob(
  detail: SmartRecruitersDetail,
  companyName: string
): NormalizedJob {
  const location = detail.location;
  const place = location?.fullLocation || [location?.city, location?.region, location?.country].filter(Boolean).join(", ");
  const workplaceType = location?.remote ? "remote" : location?.hybrid ? "hybrid" : "unknown";
  return listingToNormalizedJob({
    company: detail.company?.name || companyName,
    title: detail.name || "Role",
    location: place,
    workplaceType,
    description: sectionText(detail),
    jobUrl: detail.applyUrl || detail.postingUrl,
    sourceJobId: detail.id,
    datePosted: detail.releasedDate,
    employmentType: detail.typeOfEmployment?.label,
    provider: "smartrecruiters",
  });
}

export async function fetchSmartRecruitersBoard(
  companyId: string,
  companyName: string
): Promise<NormalizedJob[]> {
  const listUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?country=ca&limit=100`;
  const response = await fetchAllowlisted(listUrl, HOST);
  const data = (await response.json()) as { content?: SmartRecruitersListJob[] };
  const listed = [...(data.content ?? [])].sort(
    (a, b) => titleDetailRank(a.name ?? "") - titleDetailRank(b.name ?? "")
  );
  const jobs: NormalizedJob[] = [];
  for (const item of listed.slice(0, MAX_DETAIL_FETCHES)) {
    if (!item.id) continue;
    const detailUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings/${encodeURIComponent(item.id)}`;
    const detailResponse = await fetchAllowlisted(detailUrl, HOST);
    const detail = (await detailResponse.json()) as SmartRecruitersDetail;
    jobs.push(normalizeSmartRecruitersJob(detail, companyName));
    await pauseBetweenDetails();
  }
  return jobs;
}

export const smartRecruitersAdapter: JobSourceAdapter = {
  provider: "smartrecruiters",

  async detect(input: string) {
    const match = /smartrecruiters\.com/i.test(input);
    return {
      confidence: match ? 0.96 : 0,
      reason: match ? "SmartRecruiters URL detected" : "Not SmartRecruiters",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const { normalizeBoardUrl } = await import("./board-url");
    const parsed = normalizeBoardUrl(input, "smartrecruiters");
    const jobs = await fetchSmartRecruitersBoard(parsed.boardSlug, parsed.boardSlug);
    return {
      provider: "smartrecruiters",
      sourceUrl: parsed.boardUrl,
      rawText: jobs.map((job) => job.title).join("\n"),
      rawPayload: { jobs, companyName: jobs[0]?.company },
    };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const jobs = (raw.rawPayload as { jobs?: NormalizedJob[] } | undefined)?.jobs ?? [];
    if (jobs[0]) return jobs[0];
    return listingToNormalizedJob({
      company: "SmartRecruiters",
      title: "Multiple Positions",
      description: raw.rawText,
      provider: "smartrecruiters",
    });
  },
};
