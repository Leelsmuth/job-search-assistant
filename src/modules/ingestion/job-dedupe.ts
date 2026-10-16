import { matchesGtaCity } from "@/modules/location/eligibility";

const TRACKING_PARAM = /^(?:utm_|gh_src|lever-source|lever_source|source|ref|trk|mc_|fbclid|gclid|ga_|_ga)/i;

const COMPANY_SUFFIX =
  /\b(?:incorporated|inc|ltd|limited|llc|corp|corporation|co|company|gmbh|sas|plc)\b\.?$/i;

export function canonicalApplyUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (TRACKING_PARAM.test(key)) continue;
    kept.append(key, value);
  }
  const query = kept.toString();
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${host}${path}${query ? `?${query}` : ""}`;
}

export function normalizeCompanyName(name: string): string {
  const text = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.replace(COMPANY_SUFFIX, "").trim();
}

export function normalizeJobTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** City when one is named, otherwise a single remote bucket. */
export function normalizeLocationKey(location: string | null | undefined): string {
  const text = (location ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (matchesGtaCity(text)) {
    const city = [
      "toronto",
      "mississauga",
      "brampton",
      "markham",
      "vaughan",
      "richmond hill",
      "oakville",
      "burlington",
      "pickering",
      "ajax",
      "whitby",
      "oshawa",
      "milton",
      "north york",
      "scarborough",
      "etobicoke",
      "east york",
    ].find((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
    if (city) return city;
    return "gta";
  }
  if (/\bremote\b|\bworldwide\b|\banywhere\b|\bglobal\b/.test(text) && !/\b[a-z]{3,}\b/.test(text.replace(/\b(?:remote|worldwide|anywhere|global|canada|canadian|hybrid|onsite|on|site|work|from|home|the|and|or)\b/g, " "))) {
    return "remote";
  }
  if (/\bremote\b|\bworldwide\b|\banywhere\b/.test(text) && /\bcanada\b/.test(text) && !matchesGtaCity(text)) {
    const withoutRemote = text
      .replace(/\b(?:remote|worldwide|anywhere|global|canada|canadian|hybrid)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (withoutRemote.length < 3) return "remote";
  }
  return text;
}

export function jobDedupeKey(input: {
  company: string;
  title: string;
  location?: string | null;
  provider?: string | null;
  sourceJobId?: string | null;
}): string {
  if (input.provider === "jobbank" && input.sourceJobId) {
    return `jobbank:${input.sourceJobId.trim().replace(/^jobbank:/, "")}`;
  }
  const company = normalizeCompanyName(input.company);
  const title = normalizeJobTitle(input.title);
  const location = normalizeLocationKey(input.location);
  return `${company}|${title}|${location}`;
}
