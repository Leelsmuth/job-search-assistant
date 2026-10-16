import { fetchTenant } from "./ats-http";
import { listingToNormalizedJob } from "./listing-job";
import { providerPostedDate } from "./posted-date";
import type { JobSourceAdapter, NormalizedJob, RawJobSource } from "./types";

const HOST = /^[a-z0-9-]+\.jobs\.personio\.(?:de|com)$/i;

export type PersonioPosition = {
  id: string;
  name: string;
  subcompany?: string;
  office?: string;
  department?: string;
  employmentType?: string;
  createdAt?: string;
  descriptions: string[];
};

function inner(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return "";
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .trim();
}

export function parsePersonioXml(xml: string): PersonioPosition[] {
  const positions: PersonioPosition[] = [];
  for (const match of xml.matchAll(/<position>([\s\S]*?)<\/position>/gi)) {
    const block = match[1];
    const descriptions = [...block.matchAll(/<jobDescription>([\s\S]*?)<\/jobDescription>/gi)].map((part) => {
      const name = inner(part[1], "name");
      const value = inner(part[1], "value");
      return [name, value].filter(Boolean).join("\n");
    });
    positions.push({
      id: inner(block, "id"),
      name: inner(block, "name"),
      subcompany: inner(block, "subcompany"),
      office: inner(block, "office"),
      department: inner(block, "department"),
      employmentType: inner(block, "employmentType"),
      createdAt: inner(block, "createdAt") || inner(block, "created_at"),
      descriptions,
    });
  }
  return positions;
}

export function personioJobUrl(host: string, id: string): string {
  return `https://${host}/job/${id}?language=en`;
}

export function normalizePersonioPosition(
  position: PersonioPosition,
  host: string,
  companyName: string
): NormalizedJob {
  const office = position.office ?? "";
  const workplaceType = /remote/i.test(office) ? "remote" : /hybrid/i.test(position.descriptions.join(" ")) ? "hybrid" : "unknown";
  return listingToNormalizedJob({
    company: position.subcompany || companyName,
    title: position.name || "Role",
    location: office,
    workplaceType,
    description: position.descriptions.join("\n\n"),
    jobUrl: personioJobUrl(host, position.id),
    sourceJobId: position.id,
    employmentType: position.employmentType || position.department,
    datePosted: providerPostedDate("personio", position),
    provider: "personio",
  });
}

export function personioHostFromSlug(slug: string): string {
  if (slug.endsWith(".de") || slug.endsWith(".com")) return `${slug.split(".")[0]}.jobs.personio.${slug.split(".").pop()}`;
  return `${slug}.jobs.personio.de`;
}

export async function fetchPersonioBoard(slug: string): Promise<{
  companyName: string;
  jobs: NormalizedJob[];
}> {
  const host = personioHostFromSlug(slug);
  const text = await fetchTenant(`https://${host}/xml?language=en`, HOST);
  const positions = parsePersonioXml(text);
  const companyName = positions.find((position) => position.subcompany)?.subcompany || slug;
  return {
    companyName,
    jobs: positions.map((position) => normalizePersonioPosition(position, host, companyName)),
  };
}

export const personioAdapter: JobSourceAdapter = {
  provider: "personio",

  async detect(input: string) {
    const match = /personio\.(?:de|com)/i.test(input);
    return {
      confidence: match ? 0.96 : 0,
      reason: match ? "Personio URL detected" : "Not Personio",
    };
  },

  async fetch(input: string): Promise<RawJobSource> {
    const { normalizeBoardUrl } = await import("./board-url");
    const parsed = normalizeBoardUrl(input, "personio");
    const board = await fetchPersonioBoard(parsed.boardSlug);
    return {
      provider: "personio",
      sourceUrl: parsed.boardUrl,
      rawText: board.jobs.map((job) => job.title).join("\n"),
      rawPayload: board,
    };
  },

  async normalize(raw: RawJobSource): Promise<NormalizedJob> {
    const jobs = (raw.rawPayload as { jobs?: NormalizedJob[] } | undefined)?.jobs ?? [];
    if (jobs[0]) return jobs[0];
    return listingToNormalizedJob({
      company: "Personio",
      title: "Multiple Positions",
      description: raw.rawText,
      provider: "personio",
    });
  },
};
