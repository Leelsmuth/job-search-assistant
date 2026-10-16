import { canonicalPageUrl } from "@/modules/extension/urls";

export type CapturedPosting = {
  title: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  url: string | null;
  workplaceType: "remote" | "hybrid" | "on_site" | null;
};

const DESCRIPTION_LIMIT = 12000;

function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function plain(value: string): string {
  return decode(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function clip(value: string | null): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > DESCRIPTION_LIMIT ? text.slice(0, DESCRIPTION_LIMIT) : text;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function typeIncludes(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value.toLowerCase() === expected.toLowerCase();
  if (Array.isArray(value)) return value.some((item) => typeIncludes(item, expected));
  return false;
}

function organizationName(value: unknown): string | null {
  if (typeof value === "string") return plain(value) || null;
  const record = asRecord(value);
  if (!record) return null;
  return typeof record.name === "string" ? plain(record.name) || null : null;
}

function locationText(value: unknown): string | null {
  if (typeof value === "string") return plain(value) || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = locationText(item);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const address = asRecord(record.address) ?? record;
  const parts = [address.addressLocality, address.addressRegion, address.addressCountry]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => plain(part));
  return parts.length ? parts.join(", ") : null;
}

function jobPostingNodes(value: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) jobPostingNodes(item, found);
    return found;
  }
  const record = asRecord(value);
  if (!record) return found;
  if (typeIncludes(record["@type"], "JobPosting")) found.push(record);
  if (Array.isArray(record["@graph"])) jobPostingNodes(record["@graph"], found);
  return found;
}

function meta(html: string, key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    "i"
  );
  const match = html.match(pattern);
  const value = match?.[1] || match?.[2];
  return value ? plain(value) : null;
}

function tagText(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? plain(match[1]) : null;
}

function workplaceFrom(text: string): CapturedPosting["workplaceType"] {
  const lower = text.toLowerCase();
  if (/\bhybrid\b/.test(lower)) return "hybrid";
  if (/\bremote\b/.test(lower)) return "remote";
  if (/\bon[- ]?site\b|\bin[- ]office\b/.test(lower)) return "on_site";
  return null;
}

export function extractJobPosting(html: string, pageUrl: string): CapturedPosting {
  let posting: Record<string, unknown> | null = null;
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const script of scripts) {
    const body = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(body) as unknown;
      const found = jobPostingNodes(parsed);
      if (found[0]) {
        posting = found[0];
        break;
      }
    } catch {
      continue;
    }
  }

  const title =
    (typeof posting?.title === "string" ? plain(posting.title) : null) ||
    meta(html, "og:title") ||
    tagText(html, "h1") ||
    tagText(html, "title")?.replace(/\s+[|–-]\s+.*$/, "") ||
    null;
  const company =
    organizationName(posting?.hiringOrganization) ||
    meta(html, "og:site_name") ||
    null;
  const location = locationText(posting?.jobLocation) || meta(html, "job:location") || null;
  const description =
    (typeof posting?.description === "string" ? plain(posting.description) : null) ||
    meta(html, "og:description") ||
    meta(html, "description") ||
    null;
  const workplace = workplaceFrom(`${title ?? ""} ${location ?? ""} ${description ?? ""}`);

  return {
    title: title || null,
    company: company || null,
    location,
    description: clip(description),
    url: canonicalPageUrl(pageUrl),
    workplaceType: workplace,
  };
}
