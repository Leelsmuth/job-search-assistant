import { fetchTenant } from "./ats-http";
import { listingToNormalizedJob } from "./listing-job";
import type { JobSourceAdapter, NormalizedJob, RawJobSource } from "./types";

const HOST = /^[a-z0-9-]+\.recruitee\.com$/i;

export type RecruiteeOffer = {
  id?: number | string;
  title?: string;
  company_name?: string;
  location?: string;
  city?: string;
  country?: string;
  remote?: boolean;
  hybrid?: boolean;
  careers_url?: string;
  careers_apply_url?: string;
  description?: string;
  requirements?: string;
  published_at?: string;
  department?: string;
};

export function normalizeRecruiteeOffer(offer: RecruiteeOffer, companyName: string): NormalizedJob {
  const place = offer.location || [offer.city, offer.country].filter(Boolean).join(", ");
  const workplaceType = offer.remote ? "remote" : offer.hybrid ? "hybrid" : "unknown";
  const description = [offer.description, offer.requirements].filter(Boolean).join("\n\n");
  return listingToNormalizedJob({
    company: offer.company_name || companyName,
    title: offer.title || "Role",
    location: place,
    workplaceType,
    description,
    jobUrl: offer.careers_apply_url || offer.careers_url,
    sourceJobId: offer.id != null ? String(offer.id) : undefined,
    datePosted: offer.published_at,
    employmentType: offer.department,
    provider: "recruitee",
  });
}

export async function fetchRecruiteeBoard(slug: string): Promise<{
  companyName: string;
  jobs: NormalizedJob[];
}> {
  const url = `https://${slug}.recruitee.com/api/offers/`;
  const text = await fetchTenant(url, HOST);
  const data = JSON.parse(text) as { offers?: RecruiteeOffer[] };
  const offers = data.offers ?? [];
  const companyName = offers.find((offer) => offer.company_name)?.company_name || slug;
  return {
    companyName,
    jobs: offers.map((offer) => normalizeRecruiteeOffer(offer, companyName)),
  };
}

export const recruiteeAdapter: JobSourceAdapter = {
  provider: "recruitee",

  async detect(input: string) {
    const match = /recruitee\.com/i.test(input);
    return {
      confidence: match ? 0.96 : 0,
      reason: match ? "Recruitee URL detected" : "Not Recruitee",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const { normalizeBoardUrl } = await import("./board-url");
    const parsed = normalizeBoardUrl(input, "recruitee");
    const board = await fetchRecruiteeBoard(parsed.boardSlug);
    return {
      provider: "recruitee",
      sourceUrl: parsed.boardUrl,
      rawText: board.jobs.map((job) => job.title).join("\n"),
      rawPayload: board,
    };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const jobs = (raw.rawPayload as { jobs?: NormalizedJob[] } | undefined)?.jobs ?? [];
    if (jobs[0]) return jobs[0];
    return listingToNormalizedJob({
      company: "Recruitee",
      title: "Multiple Positions",
      description: raw.rawText,
      provider: "recruitee",
    });
  },
};
