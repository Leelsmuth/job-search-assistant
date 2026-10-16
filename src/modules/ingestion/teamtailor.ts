import { fetchTenant } from "./ats-http";
import { listingToNormalizedJob } from "./listing-job";
import type { JobSourceAdapter, NormalizedJob, RawJobSource } from "./types";

const HOST = /^[a-z0-9-]+\.teamtailor\.com$/i;

export type TeamtailorItem = {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  guid?: string;
  remoteStatus?: string;
  locations: string[];
};

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() ?? "";
}

export function parseTeamtailorRss(xml: string): { companyName: string; items: TeamtailorItem[] } {
  const companyName = tag(xml, "title") || "Teamtailor";
  const items: TeamtailorItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const locations = [...block.matchAll(/<tt:city>([\s\S]*?)<\/tt:city>/gi)].map((city) =>
      city[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim()
    );
    const countries = [...block.matchAll(/<tt:country>([\s\S]*?)<\/tt:country>/gi)].map((country) =>
      country[1].trim()
    );
    const place = locations.map((city, index) => [city, countries[index]].filter(Boolean).join(", "));
    items.push({
      title: tag(block, "title"),
      link: tag(block, "link"),
      description: tag(block, "description"),
      pubDate: tag(block, "pubDate"),
      guid: tag(block, "guid"),
      remoteStatus: tag(block, "remoteStatus"),
      locations: place,
    });
  }
  return { companyName, items };
}

export function normalizeTeamtailorItem(item: TeamtailorItem, companyName: string): NormalizedJob {
  const remote = item.remoteStatus?.toLowerCase();
  const workplaceType = remote === "remote" || remote === "fully_remote" ? "remote" : remote === "hybrid" ? "hybrid" : "unknown";
  const location = [
    item.locations.join("; "),
    remote === "remote" ? "Remote" : remote === "hybrid" ? "Hybrid" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return listingToNormalizedJob({
    company: companyName,
    title: item.title || "Role",
    location,
    workplaceType,
    description: item.description,
    jobUrl: item.link,
    sourceJobId: item.guid || item.link,
    datePosted: item.pubDate,
    provider: "teamtailor",
  });
}

export async function fetchTeamtailorBoard(slug: string): Promise<{
  companyName: string;
  jobs: NormalizedJob[];
}> {
  const text = await fetchTenant(`https://${slug}.teamtailor.com/jobs.rss?per_page=100`, HOST);
  const parsed = parseTeamtailorRss(text);
  const companyName = parsed.companyName === "Jobs" ? slug : parsed.companyName;
  return {
    companyName,
    jobs: parsed.items.map((item) => normalizeTeamtailorItem(item, companyName)),
  };
}

export const teamtailorAdapter: JobSourceAdapter = {
  provider: "teamtailor",

  async detect(input: string) {
    const match = /teamtailor\.com/i.test(input);
    return {
      confidence: match ? 0.96 : 0,
      reason: match ? "Teamtailor URL detected" : "Not Teamtailor",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const { normalizeBoardUrl } = await import("./board-url");
    const parsed = normalizeBoardUrl(input, "teamtailor");
    const board = await fetchTeamtailorBoard(parsed.boardSlug);
    return {
      provider: "teamtailor",
      sourceUrl: parsed.boardUrl,
      rawText: board.jobs.map((job) => job.title).join("\n"),
      rawPayload: board,
    };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const jobs = (raw.rawPayload as { jobs?: NormalizedJob[] } | undefined)?.jobs ?? [];
    if (jobs[0]) return jobs[0];
    return listingToNormalizedJob({
      company: "Teamtailor",
      title: "Multiple Positions",
      description: raw.rawText,
      provider: "teamtailor",
    });
  },
};
