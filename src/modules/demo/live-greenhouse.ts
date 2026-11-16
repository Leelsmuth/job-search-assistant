/**
 * Server side of the demo's live jobs: fetch the preselected Greenhouse board
 * and keep a small, relevant batch. The board is fixed in code, so visitors
 * cannot point the server at other URLs.
 */
import { z } from "zod";
import { fetchWithTimeout } from "@/lib/performance/fetch-with-timeout";
import { titleDetailRank } from "@/modules/ingestion/ats-http";
import { sanitizeJobTitle } from "@/modules/ingestion/html-text";
import { providerPostedDate } from "@/modules/ingestion/posted-date";
import {
  LOCATION_FEED_RANK,
  classifyLocationEligibility,
  inferWorkMode,
  workplaceTypeFromMode,
} from "@/modules/location/eligibility";
import {
  DEMO_LIVE_BATCH_SIZE,
  DEMO_LIVE_BOARD,
  safePostingUrl,
  type DemoLiveBatch,
  type DemoLiveJob,
} from "./live-jobs";

export class DemoLiveJobsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoLiveJobsError";
  }
}

/** The list endpoint without content=true: titles, locations, and links only. */
export const DEMO_LIVE_BOARD_API_URL = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
  DEMO_LIVE_BOARD.boardSlug
)}/jobs`;

const FETCH_TIMEOUT_MS = 8_000;

const listJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  absolute_url: z.string(),
  updated_at: z.string().nullish(),
  first_published: z.string().nullish(),
});

const listSchema = z.object({ jobs: z.array(z.unknown()) });

type Candidate = {
  job: DemoLiveJob;
  titleRank: number;
  locationRank: number;
  postedMs: number;
};

function toCandidate(raw: unknown, now: Date): Candidate | null {
  const parsed = listJobSchema.safeParse(raw);
  if (!parsed.success) return null;
  const source = parsed.data;
  const title = sanitizeJobTitle(source.title, "");
  const url = safePostingUrl(source.absolute_url);
  const id = String(source.id).trim();
  if (!title || !url || !id) return null;

  const location = source.location?.name?.replace(/\s+/g, " ").trim().slice(0, 200) || null;
  const postedAt = providerPostedDate("greenhouse", source, now) ?? null;
  const eligibility = classifyLocationEligibility({ title, location });

  return {
    job: {
      id: `gh-${id}`,
      title,
      company: DEMO_LIVE_BOARD.companyName,
      location,
      workplaceType: workplaceTypeFromMode(inferWorkMode({ title, location })),
      url,
      postedAt,
    },
    titleRank: titleDetailRank(title),
    locationRank: LOCATION_FEED_RANK[eligibility.class],
    postedMs: postedAt ? Date.parse(postedAt) : 0,
  };
}

/**
 * Keep the postings most relevant to the demo's sample profile (a frontend
 * developer in Canada): frontend titles, then other engineering, then the
 * rest; within each, roles open to Canada first, then newest.
 */
export function pickDemoLiveBatch(payload: unknown, now: Date = new Date()): DemoLiveBatch {
  const list = listSchema.safeParse(payload);
  if (!list.success) {
    const shape =
      payload && typeof payload === "object"
        ? `keys: ${Object.keys(payload).slice(0, 10).join(", ") || "none"}`
        : typeof payload;
    throw new DemoLiveJobsError(`Unexpected response from the job board (${shape})`);
  }

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const raw of list.data.jobs) {
    let candidate: Candidate | null;
    try {
      candidate = toCandidate(raw, now);
    } catch {
      // e.g. an out-of-range numeric entity in a title. Skip the posting, keep the rest.
      candidate = null;
    }
    if (!candidate || seen.has(candidate.job.id)) continue;
    seen.add(candidate.job.id);
    candidates.push(candidate);
  }

  candidates.sort(
    (a, b) =>
      a.titleRank - b.titleRank || a.locationRank - b.locationRank || b.postedMs - a.postedMs
  );

  return {
    source: "live",
    companyName: DEMO_LIVE_BOARD.companyName,
    providerLabel: DEMO_LIVE_BOARD.providerLabel,
    boardUrl: DEMO_LIVE_BOARD.boardUrl,
    fetchedAt: now.toISOString(),
    totalOpenings: candidates.length,
    jobs: candidates.slice(0, DEMO_LIVE_BATCH_SIZE).map((candidate) => candidate.job),
  };
}

/**
 * What went wrong, for the server log only (visitors get a generic message).
 * Node's fetch reports DNS, TLS, proxy, and connection problems on `cause`.
 */
function describeFetchFailure(error: unknown): string {
  if (!(error instanceof Error)) return "failed";
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return `timed out after ${FETCH_TIMEOUT_MS / 1000}s`;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    return `failed (${typeof code === "string" ? `${code}: ` : ""}${cause.message})`;
  }
  return `failed (${error.message})`;
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 200 ? `${flat.slice(0, 200)}…` : flat || "(empty body)";
}

export async function fetchDemoLiveBatch(now: () => Date = () => new Date()): Promise<DemoLiveBatch> {
  const url = DEMO_LIVE_BOARD_API_URL;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      headers: { Accept: "application/json", "User-Agent": "JobSearchAssistant/1.0 (demo)" },
      cache: "no-store",
      timeoutMs: FETCH_TIMEOUT_MS,
    });
  } catch (error) {
    throw new DemoLiveJobsError(`GET ${url} ${describeFetchFailure(error)}`);
  }

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    // 404 usually means the board slug is wrong or the company left Greenhouse.
    throw new DemoLiveJobsError(
      `GET ${url} answered HTTP ${response.status}: ${snippet(body)}`
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new DemoLiveJobsError(
      `GET ${url} sent invalid JSON (content-type ${response.headers.get("content-type") ?? "none"}): ${snippet(body)}`
    );
  }
  return pickDemoLiveBatch(payload, now());
}

// ---------------------------------------------------------------------------
// Cache. The endpoint is public and anonymous, so every visitor must not cost
// a request to Greenhouse. One batch is shared per server instance; the route
// also sets CDN cache headers.
// ---------------------------------------------------------------------------

export const DEMO_LIVE_CACHE_TTL_MS = 10 * 60 * 1000;
/** After a failed fetch, answer from the last batch (or fail) without retrying for this long. */
export const DEMO_LIVE_FAILURE_COOLDOWN_MS = 30 * 1000;
/** A batch older than this is not served as a fallback when the board is down. */
export const DEMO_LIVE_STALE_LIMIT_MS = 60 * 60 * 1000;

export type DemoLiveBatchCache = {
  get(): Promise<DemoLiveBatch>;
  /** Milliseconds until the current batch should be refetched. */
  freshForMs(): number;
};

export function createDemoLiveBatchCache(
  load: () => Promise<DemoLiveBatch>,
  clock: () => number = Date.now
): DemoLiveBatchCache {
  let cached: { batch: DemoLiveBatch; loadedAt: number } | null = null;
  let failure: { error: unknown; at: number } | null = null;
  let inflight: Promise<DemoLiveBatch> | null = null;

  function staleFallback(now: number): DemoLiveBatch | null {
    return cached && now - cached.loadedAt < DEMO_LIVE_STALE_LIMIT_MS ? cached.batch : null;
  }

  return {
    async get() {
      const now = clock();
      if (cached && now - cached.loadedAt < DEMO_LIVE_CACHE_TTL_MS) return cached.batch;
      if (failure && now - failure.at < DEMO_LIVE_FAILURE_COOLDOWN_MS) {
        const stale = staleFallback(now);
        if (stale) return stale;
        throw failure.error;
      }
      // Concurrent visitors share one upstream request.
      inflight ??= load()
        .then((batch) => {
          cached = { batch, loadedAt: clock() };
          failure = null;
          return batch;
        })
        .catch((error: unknown) => {
          failure = { error, at: clock() };
          const stale = staleFallback(clock());
          if (stale) return stale;
          throw error;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    freshForMs() {
      if (!cached) return 0;
      return Math.max(0, DEMO_LIVE_CACHE_TTL_MS - (clock() - cached.loadedAt));
    },
  };
}
