import { parseWorkdayPostedDate } from "@/modules/ingestion/workday";

export type PostedAtSource = "provider" | "first_seen";

/** Parse an ISO string, epoch seconds/ms, or Workday "Posted N Days Ago" text. */
export function parseProviderInstant(value: unknown, now = new Date()): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return epochToIso(value);
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^posted\b/i.test(trimmed)) return parseWorkdayPostedDate(trimmed, now);
  if (/^\d{10,13}$/.test(trimmed)) return epochToIso(Number(trimmed));
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function epochToIso(value: number): string | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const ms = value >= 1e12 ? value : value >= 1e9 ? value * 1000 : NaN;
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

function firstInstant(values: unknown[], now: Date): string | undefined {
  for (const value of values) {
    const instant = parseProviderInstant(value, now);
    if (instant) return instant;
  }
  return undefined;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function greenhouseInstant(payload: unknown, now: Date): string | undefined {
  const root = record(payload);
  const job = record(root?.job) ?? root;
  if (!job) return undefined;
  return firstInstant([job.first_published, job.updated_at], now);
}

/**
 * Provider posted/published timestamp.
 * Greenhouse prefers first_published, then updated_at.
 * Workday accepts "Posted Today", "Posted Yesterday", and "Posted N Days Ago".
 */
export function providerPostedDate(
  provider: string,
  payload: unknown,
  now = new Date()
): string | undefined {
  const root = record(payload);
  switch (provider) {
    case "greenhouse":
      return greenhouseInstant(payload, now);
    case "lever":
      return firstInstant([root?.createdAt], now);
    case "ashby":
      return firstInstant([root?.publishedAt], now);
    case "workday":
      return firstInstant([root?.postedOn, root?.startDate], now);
    case "smartrecruiters":
      return firstInstant([root?.releasedDate], now);
    case "workable":
      return firstInstant([root?.published_on], now);
    case "recruitee":
      return firstInstant([root?.published_at], now);
    case "bamboohr":
      return firstInstant([root?.datePosted], now);
    case "teamtailor":
      return firstInstant([root?.pubDate], now);
    case "personio":
      return firstInstant([root?.createdAt, root?.created_at], now);
    case "rippling":
      return firstInstant([root?.createdAt, root?.postedDate], now);
    case "jobbank":
      return firstInstant([root?.datePosted, root?.postingDate], now);
    case "remotive":
      return firstInstant([root?.publication_date], now);
    case "weworkremotely":
      return firstInstant([root?.pubDate], now);
    case "himalayas":
      return firstInstant([root?.pubDate], now);
    case "remoteok":
      return firstInstant([root?.date, root?.created], now);
    case "adzuna":
      return firstInstant([root?.created], now);
    default:
      return firstInstant([root?.datePosted, root?.publishedAt, root?.createdAt], now);
  }
}

export function resolveStoredPostedAt(input: {
  providerDate?: string | null;
  discoveredAt: Date;
}): { postedAt: Date; postedAtSource: PostedAtSource; datePosted?: Date } {
  const instant = input.providerDate ? parseProviderInstant(input.providerDate) : undefined;
  if (instant) {
    const postedAt = new Date(instant);
    return { postedAt, postedAtSource: "provider", datePosted: postedAt };
  }
  return { postedAt: input.discoveredAt, postedAtSource: "first_seen" };
}
