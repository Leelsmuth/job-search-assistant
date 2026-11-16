import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import boardList from "@/test/fixtures/boards/greenhouse-demo-list.json";
import {
  DEMO_LIVE_BATCH_SIZE,
  DEMO_LIVE_BOARD,
  parseDemoLiveBatch,
  safePostingUrl,
  selectDemoLiveFeed,
  type DemoLiveBatch,
  type DemoLiveFeedFilters,
  type DemoLiveJob,
} from "@/modules/demo/live-jobs";
import {
  DEMO_LIVE_BOARD_API_URL,
  DEMO_LIVE_CACHE_TTL_MS,
  DEMO_LIVE_FAILURE_COOLDOWN_MS,
  DEMO_LIVE_STALE_LIMIT_MS,
  DemoLiveJobsError,
  createDemoLiveBatchCache,
  fetchDemoLiveBatch,
  pickDemoLiveBatch,
} from "@/modules/demo/live-greenhouse";
import { isDemoJobId } from "@/modules/demo/sample-jobs";
import { createDemoState, parseDemoState, saveDemoJob } from "@/modules/demo/demo-state";

const NOW = new Date("2026-03-08T12:00:00.000Z");

const ALL: DemoLiveFeedFilters = { search: "", workplace: "all", sort: "match" };

function batch(): DemoLiveBatch {
  return pickDemoLiveBatch(boardList, NOW);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("pickDemoLiveBatch", () => {
  it("keeps a small batch, most relevant to the sample frontend profile first", () => {
    const result = batch();
    expect(result.jobs).toHaveLength(DEMO_LIVE_BATCH_SIZE);
    // Frontend titles, then other engineering, then the rest. Within each,
    // roles open to Canada come first, then the newest.
    expect(result.jobs.map((job) => job.id)).toEqual([
      "gh-4103", // Frontend, remote Canada
      "gh-4102", // Frontend, remote US only
      "gh-4105", // Engineering, remote Canada
      "gh-4104", // Engineering, hybrid Toronto
      "gh-4108", // Engineering, Toronto
      "gh-4106", // Other, newest of the out-of-area roles
    ]);
  });

  it("reports the board and how many valid openings it had", () => {
    const result = batch();
    expect(result).toMatchObject({
      companyName: DEMO_LIVE_BOARD.companyName,
      providerLabel: "Greenhouse",
      boardUrl: DEMO_LIVE_BOARD.boardUrl,
      fetchedAt: NOW.toISOString(),
      totalOpenings: 8,
    });
  });

  it("maps each posting to what the demo shows", () => {
    const byId = new Map(batch().jobs.map((job) => [job.id, job]));
    expect(byId.get("gh-4103")).toEqual<DemoLiveJob>({
      id: "gh-4103",
      title: "Frontend Engineer, Admin Console",
      company: "Tailscale",
      location: "Remote - Canada",
      workplaceType: "remote",
      url: "https://job-boards.greenhouse.io/tailscale/jobs/4103",
      postedAt: "2026-02-25T14:00:00.000Z",
    });
    // HTML entities in titles are decoded.
    expect(byId.get("gh-4105")?.title).toBe("Backend Developer & SRE");
    // Workplace type is read from the location text; no signal means unknown.
    expect(byId.get("gh-4104")?.workplaceType).toBe("hybrid");
    expect(byId.get("gh-4108")?.workplaceType).toBeNull();
    // Without first_published, the posted date falls back to updated_at.
    expect(byId.get("gh-4104")?.postedAt).toBe("2026-03-05T15:00:00.000Z");
  });

  it("drops unsafe links, blank titles, malformed entries, and duplicates", () => {
    const jobs = (boardList as { jobs: unknown[] }).jobs;
    const isBad = (raw: unknown) =>
      typeof raw !== "object" || raw === null || Number((raw as { id: unknown }).id) >= 4190;
    // Only the rejected entries: nothing survives, not even to fill the batch.
    expect(pickDemoLiveBatch({ jobs: jobs.filter(isBad) }, NOW)).toMatchObject({
      totalOpenings: 0,
      jobs: [],
    });
    // The duplicate of 4103 is dropped: the first copy wins.
    const withDuplicate = pickDemoLiveBatch({ jobs: jobs.slice(2) }, NOW);
    expect(withDuplicate.jobs.filter((job) => job.id === "gh-4103")).toEqual([
      expect.objectContaining({ title: "Frontend Engineer, Admin Console" }),
    ]);
  });

  it("never reuses a sample job id, so live jobs cannot enter the demo tracker", () => {
    for (const job of batch().jobs) {
      expect(isDemoJobId(job.id)).toBe(false);
      expect(() => saveDemoJob(createDemoState(NOW), job.id, NOW)).toThrow("Job not found");
    }
  });

  it("skips a posting that cannot be read instead of failing the batch", () => {
    const jobs = [
      { id: 1, title: "Frontend Engineer &#99999999;", absolute_url: "https://x.test/1" },
      { id: 2, title: "React Developer", absolute_url: "https://x.test/2", location: { name: "Remote - Canada" } },
    ];
    expect(pickDemoLiveBatch({ jobs }, NOW).jobs.map((job) => job.id)).toEqual(["gh-2"]);
  });

  it("returns an empty batch for an empty board", () => {
    expect(pickDemoLiveBatch({ jobs: [] }, NOW)).toMatchObject({ totalOpenings: 0, jobs: [] });
  });

  it.each([null, "jobs", [], { jobs: "none" }, { meta: {} }])(
    "rejects an unexpected payload (%j)",
    (payload) => {
      expect(() => pickDemoLiveBatch(payload, NOW)).toThrow(DemoLiveJobsError);
    }
  );
});

describe("safePostingUrl", () => {
  it.each([
    ["https://job-boards.greenhouse.io/tailscale/jobs/1", "https://job-boards.greenhouse.io/tailscale/jobs/1"],
    ["https://tailscale.com/careers?gh_jid=1", "https://tailscale.com/careers?gh_jid=1"],
  ])("accepts %s", (input, expected) => {
    expect(safePostingUrl(input)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "http://job-boards.greenhouse.io/x",
    "data:text/html,hi",
    "https://user:pass@example.com/",
    "/relative/path",
    "",
    42,
    null,
  ])("rejects %j", (input) => {
    expect(safePostingUrl(input)).toBeNull();
  });
});

describe("parseDemoLiveBatch", () => {
  it("round-trips a batch through JSON, as sessionStorage and the API do", () => {
    const original = batch();
    expect(parseDemoLiveBatch(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it("rejects a batch with any tampered job, instead of rendering part of it", () => {
    const original = batch();
    const tamper = (patch: Partial<Record<keyof DemoLiveJob, unknown>>) => ({
      ...original,
      jobs: [{ ...original.jobs[0], ...patch }, ...original.jobs.slice(1)],
    });
    expect(parseDemoLiveBatch(tamper({ url: "javascript:alert(1)" }))).toBeNull();
    expect(parseDemoLiveBatch(tamper({ workplaceType: "moon" }))).toBeNull();
    expect(parseDemoLiveBatch(tamper({ title: "" }))).toBeNull();
    expect(parseDemoLiveBatch(tamper({ postedAt: "yesterday-ish" }))).toBeNull();
    expect(parseDemoLiveBatch(tamper({ location: 7 }))).toBeNull();
  });

  it.each([
    null,
    "batch",
    {},
    { jobs: [] },
    { ...{ companyName: "X", providerLabel: "Greenhouse", boardUrl: "javascript:x" }, fetchedAt: NOW.toISOString(), totalOpenings: 0, jobs: [] },
    { companyName: "X", providerLabel: "Greenhouse", boardUrl: "https://x.test", fetchedAt: "never", totalOpenings: 0, jobs: [] },
    { companyName: "X", providerLabel: "Greenhouse", boardUrl: "https://x.test", fetchedAt: NOW.toISOString(), totalOpenings: -1, jobs: [] },
  ])("rejects a malformed batch (%j)", (value) => {
    expect(parseDemoLiveBatch(value)).toBeNull();
  });

  it("caps the batch at the demo size and drops duplicate ids", () => {
    const original = batch();
    const padded = {
      ...original,
      jobs: [original.jobs[0], ...original.jobs, ...original.jobs],
    };
    const parsed = parseDemoLiveBatch(padded);
    expect(parsed?.jobs.map((job) => job.id)).toEqual(
      original.jobs.slice(0, DEMO_LIVE_BATCH_SIZE - 1).map((job) => job.id)
    );
  });

  it("leaves the demo state untouched: stored live ids are dropped by the demo state parser", () => {
    const state = createDemoState(NOW);
    const withLive = { ...state, savedJobIds: [...state.savedJobIds, batch().jobs[0].id] };
    expect(parseDemoState(withLive)?.savedJobIds).toEqual(state.savedJobIds);
  });
});

describe("selectDemoLiveFeed", () => {
  it("shows the batch in board order by default", () => {
    expect(selectDemoLiveFeed(batch(), ALL).map((job) => job.id)).toEqual(
      batch().jobs.map((job) => job.id)
    );
  });

  it("follows the feed search across title, company, and location", () => {
    const ids = (search: string) =>
      selectDemoLiveFeed(batch(), { ...ALL, search }).map((job) => job.id);
    expect(ids("frontend")).toEqual(["gh-4103", "gh-4102"]);
    expect(ids("  TORONTO ")).toEqual(["gh-4104", "gh-4108"]);
    expect(ids("tailscale")).toHaveLength(DEMO_LIVE_BATCH_SIZE);
    expect(ids("kotlin")).toEqual([]);
  });

  it("follows the workplace filter; postings that do not say only show under All", () => {
    const ids = (workplace: DemoLiveFeedFilters["workplace"]) =>
      selectDemoLiveFeed(batch(), { ...ALL, workplace }).map((job) => job.id);
    expect(ids("remote")).toEqual(["gh-4103", "gh-4102", "gh-4105"]);
    expect(ids("hybrid")).toEqual(["gh-4104"]);
    expect(ids("on_site")).toEqual([]);
  });

  it("sorts newest first when asked, with undated postings last", () => {
    const undated = { ...batch(), jobs: [{ ...batch().jobs[5], postedAt: null }, ...batch().jobs.slice(0, 5)] };
    expect(selectDemoLiveFeed(undated, { ...ALL, sort: "newest" }).map((job) => job.id)).toEqual([
      "gh-4108", // Mar 7
      "gh-4105", // Mar 6
      "gh-4104", // Mar 5 (updated_at)
      "gh-4102", // Mar 1
      "gh-4103", // Feb 25
      "gh-4106", // no date
    ]);
  });

  it("does not reorder for match or salary sorts, which live jobs have no data for", () => {
    for (const sort of ["match", "salary"] as const) {
      expect(selectDemoLiveFeed(batch(), { ...ALL, sort }).map((job) => job.id)).toEqual(
        batch().jobs.map((job) => job.id)
      );
    }
  });
});

describe("fetchDemoLiveBatch", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads only the preselected board's list, without job content", async () => {
    fetchMock.mockResolvedValue(jsonResponse(boardList));
    const result = await fetchDemoLiveBatch(() => NOW);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://boards-api.greenhouse.io/v1/boards/tailscale/jobs"
    );
    expect(DEMO_LIVE_BOARD_API_URL).not.toContain("content=");
    expect(result.jobs.map((job) => job.id)[0]).toBe("gh-4103");
  });

  it("logs the status and body when the board answers with an error", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"status":404,"error":"Board not found"}', { status: 404 })
    );
    await expect(fetchDemoLiveBatch()).rejects.toThrow(
      'GET https://boards-api.greenhouse.io/v1/boards/tailscale/jobs answered HTTP 404: {"status":404,"error":"Board not found"}'
    );
  });

  it("logs the network cause (DNS, TLS, proxy) when the request fails", async () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND boards-api.greenhouse.io"), {
      code: "ENOTFOUND",
    });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed", { cause }));
    await expect(fetchDemoLiveBatch()).rejects.toThrow(
      "failed (ENOTFOUND: getaddrinfo ENOTFOUND boards-api.greenhouse.io)"
    );
  });

  it("logs a timeout as a timeout", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
    await expect(fetchDemoLiveBatch()).rejects.toThrow("timed out after 8s");
  });

  it("logs what came back when the body is not a job list", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html><body>Access denied</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );
    await expect(fetchDemoLiveBatch()).rejects.toThrow(
      "sent invalid JSON (content-type text/html): <html><body>Access denied</body></html>"
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 200, message: "moved" }));
    await expect(fetchDemoLiveBatch()).rejects.toThrow(
      "Unexpected response from the job board (keys: status, message)"
    );
  });
});

describe("createDemoLiveBatchCache", () => {
  function setup() {
    let now = 1_000_000;
    const load = vi.fn<() => Promise<DemoLiveBatch>>();
    const cache = createDemoLiveBatchCache(load, () => now);
    return {
      cache,
      load,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  it("serves one batch to every visitor until it expires", async () => {
    const { cache, load, advance } = setup();
    const first = batch();
    const second = { ...batch(), fetchedAt: "2026-03-08T12:10:00.000Z" };
    load.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    expect(await cache.get()).toBe(first);
    advance(DEMO_LIVE_CACHE_TTL_MS - 1);
    expect(await cache.get()).toBe(first);
    expect(cache.freshForMs()).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);

    advance(1);
    expect(await cache.get()).toBe(second);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one upstream request between concurrent visitors", async () => {
    const { cache, load } = setup();
    let resolve!: (value: DemoLiveBatch) => void;
    load.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = [cache.get(), cache.get(), cache.get()];
    resolve(batch());
    const results = await Promise.all(pending);
    expect(load).toHaveBeenCalledTimes(1);
    expect(new Set(results).size).toBe(1);
  });

  it("does not retry a failed board on every request", async () => {
    const { cache, load, advance } = setup();
    load.mockRejectedValueOnce(new DemoLiveJobsError("down")).mockResolvedValueOnce(batch());

    await expect(cache.get()).rejects.toThrow("down");
    advance(DEMO_LIVE_FAILURE_COOLDOWN_MS - 1);
    await expect(cache.get()).rejects.toThrow("down");
    expect(load).toHaveBeenCalledTimes(1);

    advance(1);
    await expect(cache.get()).resolves.toMatchObject({ totalOpenings: 8 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("falls back to the last batch while the board is down, up to a limit", async () => {
    const { cache, load, advance } = setup();
    const good = batch();
    load.mockResolvedValueOnce(good).mockRejectedValue(new DemoLiveJobsError("down"));

    await cache.get();
    advance(DEMO_LIVE_CACHE_TTL_MS);
    expect(await cache.get()).toBe(good);
    expect(cache.freshForMs()).toBe(0);

    advance(DEMO_LIVE_STALE_LIMIT_MS);
    await expect(cache.get()).rejects.toThrow("down");
  });
});

describe("GET /api/demo/live-jobs", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    // The route keeps its cache in module scope; start each test with a fresh one.
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function route() {
    return import("@/app/api/demo/live-jobs/route");
  }

  it("returns a batch the browser store accepts, cached at the edge", async () => {
    fetchMock.mockResolvedValue(jsonResponse(boardList));
    const { GET } = await route();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=600, stale-while-revalidate=60"
    );
    const body = await response.json();
    expect(parseDemoLiveBatch(body)).toEqual(body);
    expect(body.jobs).toHaveLength(DEMO_LIVE_BATCH_SIZE);

    await GET();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers 502 with a friendly message and no caching when the board fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const { GET } = await route();
    const response = await GET();
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Live jobs are unavailable right now. The sample jobs still work.",
    });
  });
});
