import { fetchAllowlisted } from "@/modules/ingestion/ats-http";
import { annualSalary, listingToNormalizedJob } from "@/modules/ingestion/listing-job";
import { parseProviderInstant } from "@/modules/ingestion/posted-date";
import type { NormalizedJob } from "@/modules/ingestion/types";
import { classifyLocationEligibility } from "@/modules/location/eligibility";

const REMOTIVE_HOST = /^(?:www\.)?remotive\.com$/i;
const WWR_HOST = /^(?:www\.)?weworkremotely\.com$/i;
const HIMALAYAS_HOST = /^(?:www\.)?himalayas\.app$/i;
const REMOTEOK_HOST = /^(?:www\.)?remoteok\.com$/i;
const ADZUNA_HOST = /^api\.adzuna\.com$/i;

function keepCanadaEligible(job: NormalizedJob): boolean {
  const eligibility = classifyLocationEligibility(job);
  return eligibility.class === "remote_canada" || eligibility.class === "hybrid_gta" || eligibility.class === "onsite_gta";
}

export type RemotiveJob = {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  category?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
};

export function normalizeRemotiveJob(job: RemotiveJob): NormalizedJob {
  const location = job.candidate_required_location || "Remote";
  return listingToNormalizedJob({
    company: job.company_name || "Company",
    title: job.title || "Role",
    location: /remote/i.test(location) ? location : `Remote, ${location}`,
    workplaceType: "remote",
    description: job.description,
    jobUrl: job.url,
    sourceJobId: job.id != null ? `remotive:${job.id}` : undefined,
    datePosted: job.publication_date,
    employmentType: job.job_type,
    salaryCurrency: /usd|\$/i.test(job.salary ?? "") ? "USD" : "CAD",
    provider: "remotive",
  });
}

export function selectRemotiveJobs(jobs: readonly RemotiveJob[]): NormalizedJob[] {
  return jobs.map(normalizeRemotiveJob).filter(keepCanadaEligible);
}

export async function fetchRemotiveJobs(): Promise<NormalizedJob[]> {
  const response = await fetchAllowlisted(
    "https://remotive.com/api/remote-jobs?category=software-dev",
    REMOTIVE_HOST
  );
  const data = (await response.json()) as { jobs?: RemotiveJob[] };
  return selectRemotiveJobs(data.jobs ?? []);
}

export type WwrItem = {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  guid?: string;
  region?: string;
};

function rssTag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() ?? "";
}

export function parseWwrRss(xml: string): WwrItem[] {
  const items: WwrItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const region = block.match(/<region>([\s\S]*?)<\/region>/i)?.[1]?.trim();
    items.push({
      title: rssTag(block, "title"),
      link: rssTag(block, "link"),
      description: rssTag(block, "description"),
      pubDate: rssTag(block, "pubDate"),
      guid: rssTag(block, "guid"),
      region,
    });
  }
  return items;
}

export function normalizeWwrItem(item: WwrItem): NormalizedJob {
  const region = item.region || "";
  const location = /anywhere|worldwide|global/i.test(`${item.title} ${region} ${item.description}`)
    ? "Remote, Worldwide"
    : region
      ? `Remote, ${region}`
      : "Remote";
  const company = item.title.split(":")[0]?.trim() || "Company";
  const title = item.title.includes(":") ? item.title.split(":").slice(1).join(":").trim() : item.title;
  return listingToNormalizedJob({
    company,
    title: title || item.title,
    location,
    workplaceType: "remote",
    description: item.description,
    jobUrl: item.link,
    sourceJobId: item.guid || item.link,
    datePosted: item.pubDate,
    provider: "weworkremotely",
  });
}

export function selectWwrJobs(items: readonly WwrItem[]): NormalizedJob[] {
  return items.map(normalizeWwrItem).filter(keepCanadaEligible);
}

export async function fetchWwrJobs(): Promise<NormalizedJob[]> {
  const response = await fetchAllowlisted(
    "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
    WWR_HOST
  );
  return selectWwrJobs(parseWwrRss(await response.text()));
}

export type HimalayasJob = {
  title?: string;
  excerpt?: string;
  companyName?: string;
  employmentType?: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string;
  currency?: string;
  locationRestrictions?: string[];
  description?: string;
  pubDate?: string;
  applicationLink?: string;
  guid?: string;
};

export function normalizeHimalayasJob(job: HimalayasJob): NormalizedJob {
  const restrictions = job.locationRestrictions ?? [];
  const location =
    restrictions.length === 0 ? "Remote, Worldwide" : `Remote, ${restrictions.join(", ")}`;
  const annual = !job.salaryPeriod || job.salaryPeriod === "annual";
  return listingToNormalizedJob({
    company: job.companyName || "Company",
    title: job.title || "Role",
    location,
    workplaceType: "remote",
    description: job.description || job.excerpt,
    jobUrl: job.applicationLink,
    sourceJobId: job.guid ? `himalayas:${job.guid}` : undefined,
    datePosted: job.pubDate,
    employmentType: job.employmentType,
    salaryMin: annual ? job.minSalary : undefined,
    salaryMax: annual ? job.maxSalary : undefined,
    salaryCurrency: job.currency || "USD",
    provider: "himalayas",
  });
}

export function selectHimalayasJobs(jobs: readonly HimalayasJob[]): NormalizedJob[] {
  return jobs
    .filter((job) => {
      const restrictions = job.locationRestrictions ?? [];
      if (restrictions.length === 0) return true;
      return restrictions.some((country) => /canada/i.test(country));
    })
    .map(normalizeHimalayasJob)
    .filter(keepCanadaEligible);
}

export async function fetchHimalayasJobs(): Promise<NormalizedJob[]> {
  const response = await fetchAllowlisted(
    "https://himalayas.app/jobs/api/search?q=frontend%20engineer&page=1",
    HIMALAYAS_HOST
  );
  const data = (await response.json()) as { jobs?: HimalayasJob[] };
  return selectHimalayasJobs(data.jobs ?? []);
}

export type RemoteOkJob = {
  id?: number | string;
  position?: string;
  company?: string;
  location?: string;
  description?: string;
  url?: string;
  apply_url?: string;
  date?: string;
  created?: string;
  salary_min?: number;
  salary_max?: number;
  tags?: string[];
};

export function normalizeRemoteOkJob(job: RemoteOkJob): NormalizedJob | null {
  if (!job.position || !job.company) return null;
  const location = job.location || "Remote, Worldwide";
  return listingToNormalizedJob({
    company: job.company,
    title: job.position,
    location: /remote|worldwide|anywhere/i.test(location) ? location : `Remote, ${location}`,
    workplaceType: "remote",
    description: job.description,
    jobUrl: job.url || (job.id != null ? `https://remoteok.com/remote-jobs/${job.id}` : undefined),
    sourceJobId: job.id != null ? `remoteok:${job.id}` : undefined,
    datePosted: parseProviderInstant(job.date) ?? parseProviderInstant(job.created),
    salaryMin: annualSalary(job.salary_min),
    salaryMax: annualSalary(job.salary_max),
    salaryCurrency: "USD",
    provider: "remoteok",
  });
}

export function selectRemoteOkJobs(rows: readonly unknown[]): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || !("position" in row)) continue;
    const normalized = normalizeRemoteOkJob(row as RemoteOkJob);
    if (normalized && keepCanadaEligible(normalized)) jobs.push(normalized);
  }
  return jobs;
}

export async function fetchRemoteOkJobs(): Promise<NormalizedJob[]> {
  const response = await fetchAllowlisted("https://remoteok.com/api?tag=frontend", REMOTEOK_HOST, {
    userAgent: "Mozilla/5.0 (compatible; JobSearchAssistant/1.0)",
  });
  const data = (await response.json()) as unknown;
  return selectRemoteOkJobs(Array.isArray(data) ? data : []);
}

export type AdzunaJob = {
  id?: string | number;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  redirect_url?: string;
  created?: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
  contract_time?: string;
};

export function normalizeAdzunaJob(job: AdzunaJob): NormalizedJob {
  const location = job.location?.display_name || "Canada";
  const predicted = job.salary_is_predicted === "1" || job.salary_is_predicted === 1;
  return listingToNormalizedJob({
    company: job.company?.display_name || "Company",
    title: job.title || "Role",
    location,
    description: job.description,
    jobUrl: job.redirect_url,
    sourceJobId: job.id != null ? `adzuna:${job.id}` : undefined,
    datePosted: job.created,
    employmentType: job.contract_time,
    salaryMin: predicted ? undefined : annualSalary(job.salary_min),
    salaryMax: predicted ? undefined : annualSalary(job.salary_max),
    salaryCurrency: "CAD",
    provider: "adzuna",
  });
}

export function selectAdzunaJobs(jobs: readonly AdzunaJob[]): NormalizedJob[] {
  return jobs.map(normalizeAdzunaJob).filter(keepCanadaEligible);
}

export async function fetchAdzunaJobs(env: NodeJS.ProcessEnv = process.env): Promise<NormalizedJob[]> {
  const appId = env.ADZUNA_APP_ID?.trim();
  const appKey = env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) return [];
  const url = new URL("https://api.adzuna.com/v1/api/jobs/ca/search/1");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", "20");
  url.searchParams.set("what", "frontend developer");
  url.searchParams.set("where", "Canada");
  url.searchParams.set("content-type", "application/json");
  const response = await fetchAllowlisted(url.toString(), ADZUNA_HOST);
  const data = (await response.json()) as { results?: AdzunaJob[] };
  return selectAdzunaJobs(data.results ?? []);
}
