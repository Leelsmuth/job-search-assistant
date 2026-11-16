/**
 * Live jobs for the public demo: a small batch of real postings from one
 * preselected public Greenhouse board, shown next to the fictional sample jobs.
 *
 * Pure code shared by the server route (src/app/api/demo/live-jobs) and the
 * browser store (src/app/demo/demo-live-store.ts). Live jobs are never written
 * into the demo state: they cannot be saved, dismissed, or tracked in the demo.
 * Saving one asks the visitor to sign in instead.
 */

export const DEMO_LIVE_BOARD = {
  provider: "greenhouse",
  providerLabel: "Greenhouse",
  companyName: "Tailscale",
  boardSlug: "tailscale",
  boardUrl: "https://boards.greenhouse.io/tailscale",
} as const;

/** How many postings the demo shows from the board. */
export const DEMO_LIVE_BATCH_SIZE = 6;

/** Same-origin endpoint the demo calls. Public; see isDemoPath in src/lib/env.ts. */
export const DEMO_LIVE_JOBS_ENDPOINT = "/api/demo/live-jobs";

export type DemoLiveJob = {
  /** Namespaced ("gh-<id>") so it can never collide with a sample job id. */
  id: string;
  title: string;
  company: string;
  location: string | null;
  /** From the title and location text only. Null when the posting does not say. */
  workplaceType: DemoLiveWorkplace | null;
  /** The employer's public posting. Always https. */
  url: string;
  /** ISO timestamp from the provider, when it gave one. */
  postedAt: string | null;
};

export type DemoLiveWorkplace = "remote" | "hybrid" | "on_site";

const WORKPLACES: readonly DemoLiveWorkplace[] = ["remote", "hybrid", "on_site"];

/**
 * "live" comes from Greenhouse. "snapshot" is a saved response served in
 * development only (DEMO_LIVE_JOBS_SNAPSHOT; see live-snapshot.ts), and the
 * demo labels it as such.
 */
export type DemoLiveSource = "live" | "snapshot";

export type DemoLiveBatch = {
  source: DemoLiveSource;
  companyName: string;
  providerLabel: string;
  boardUrl: string;
  fetchedAt: string;
  /** Openings on the board when it was fetched; the batch is a subset. */
  totalOpenings: number;
  jobs: DemoLiveJob[];
};

// ---------------------------------------------------------------------------
// Validation. The batch arrives over the network and is read back from
// sessionStorage, so it is checked field by field before it is rendered.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Only https links are rendered, so a payload can never inject a javascript: URL. */
export function safePostingUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function parseLiveJob(value: unknown): DemoLiveJob | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id, 100);
  const title = nonEmptyString(value.title, 200);
  const company = nonEmptyString(value.company, 200);
  const url = safePostingUrl(value.url);
  if (!id || !title || !company || !url) return null;
  if (value.location !== null && typeof value.location !== "string") return null;
  const { workplaceType } = value;
  if (workplaceType !== null && !WORKPLACES.includes(workplaceType as DemoLiveWorkplace)) {
    return null;
  }
  if (value.postedAt !== null && !isIsoDate(value.postedAt)) return null;
  return {
    id,
    title,
    company,
    location: value.location ? value.location.slice(0, 200) : null,
    workplaceType: workplaceType as DemoLiveWorkplace | null,
    url,
    postedAt: value.postedAt,
  };
}

/** Returns null for anything malformed, so the caller falls back to "not loaded". */
export function parseDemoLiveBatch(value: unknown): DemoLiveBatch | null {
  if (!isRecord(value) || !Array.isArray(value.jobs)) return null;
  // Batches stored before the source field existed came from Greenhouse.
  const source = value.source ?? "live";
  if (source !== "live" && source !== "snapshot") return null;
  const companyName = nonEmptyString(value.companyName, 200);
  const providerLabel = nonEmptyString(value.providerLabel, 50);
  const boardUrl = safePostingUrl(value.boardUrl);
  if (!companyName || !providerLabel || !boardUrl || !isIsoDate(value.fetchedAt)) return null;
  const { totalOpenings } = value;
  if (typeof totalOpenings !== "number" || !Number.isInteger(totalOpenings) || totalOpenings < 0) {
    return null;
  }

  const jobs: DemoLiveJob[] = [];
  const seen = new Set<string>();
  for (const raw of value.jobs.slice(0, DEMO_LIVE_BATCH_SIZE)) {
    const job = parseLiveJob(raw);
    if (!job) return null;
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    jobs.push(job);
  }

  return {
    source,
    companyName,
    providerLabel,
    boardUrl,
    fetchedAt: value.fetchedAt,
    totalOpenings: Math.max(totalOpenings, jobs.length),
    jobs,
  };
}

// ---------------------------------------------------------------------------
// Feed selection. Live jobs follow the feed's search and workplace filters.
// They have no fit score or salary, so "newest" is the only sort that reorders
// them; otherwise they keep the board order (most relevant titles first).
// ---------------------------------------------------------------------------

export type DemoLiveFeedFilters = {
  search: string;
  workplace: "all" | "remote" | "hybrid" | "on_site";
  sort: "match" | "newest" | "salary";
};

function matchesSearch(job: DemoLiveJob, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [job.title, job.company, job.location ?? ""].some((value) =>
    value.toLowerCase().includes(needle)
  );
}

/** A job whose posting does not state a workplace type only shows under "All". */
function matchesWorkplace(job: DemoLiveJob, workplace: DemoLiveFeedFilters["workplace"]): boolean {
  return workplace === "all" || job.workplaceType === workplace;
}

/** Newest first; jobs without a date go last. */
function compareNewest(a: DemoLiveJob, b: DemoLiveJob): number {
  if (a.postedAt === b.postedAt) return 0;
  if (!a.postedAt) return 1;
  if (!b.postedAt) return -1;
  return Date.parse(b.postedAt) - Date.parse(a.postedAt);
}

export function selectDemoLiveFeed(batch: DemoLiveBatch, filters: DemoLiveFeedFilters): DemoLiveJob[] {
  const jobs = batch.jobs.filter(
    (job) => matchesSearch(job, filters.search) && matchesWorkplace(job, filters.workplace)
  );
  if (filters.sort === "newest") {
    // Stable sort keeps board order for ties.
    jobs.sort(compareNewest);
  }
  return jobs;
}
