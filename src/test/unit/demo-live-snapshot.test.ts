import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import boardList from "@/test/fixtures/boards/greenhouse-demo-list.json";
import {
  DEFAULT_DEMO_LIVE_SNAPSHOT,
  loadDemoLiveSnapshot,
  resolveDemoLiveSource,
} from "@/modules/demo/live-snapshot";
import { DemoLiveJobsError, pickDemoLiveBatch } from "@/modules/demo/live-greenhouse";
import { DEMO_LIVE_BATCH_SIZE, parseDemoLiveBatch } from "@/modules/demo/live-jobs";

const ROOT = "/repo";
const NOW = new Date("2026-11-16T12:00:00.000Z");

describe("resolveDemoLiveSource", () => {
  const dev = (value?: string) =>
    resolveDemoLiveSource({ NODE_ENV: "development", DEMO_LIVE_JOBS_SNAPSHOT: value }, ROOT);

  it("calls Greenhouse when the variable is unset or turned off", () => {
    for (const value of [undefined, "", "  ", "0", "false", "OFF", "no"]) {
      expect(dev(value)).toEqual({ kind: "greenhouse" });
    }
  });

  it("uses the bundled sample for 1/true/on/yes under next dev", () => {
    for (const value of ["1", "true", "ON", " yes "]) {
      expect(dev(value)).toEqual({
        kind: "snapshot",
        file: path.resolve(ROOT, DEFAULT_DEMO_LIVE_SNAPSHOT),
      });
    }
  });

  it("uses a saved response from a path, relative to the project root", () => {
    expect(dev("tmp/greenhouse.json")).toEqual({
      kind: "snapshot",
      file: path.resolve(ROOT, "tmp/greenhouse.json"),
    });
    expect(dev("/abs/greenhouse.json")).toEqual({ kind: "snapshot", file: "/abs/greenhouse.json" });
  });

  it.each(["production", "test", undefined])(
    "is ignored, with a warning, when NODE_ENV is %s",
    (nodeEnv) => {
      const setting = resolveDemoLiveSource(
        { NODE_ENV: nodeEnv, DEMO_LIVE_JOBS_SNAPSHOT: "1" },
        ROOT
      );
      expect(setting.kind).toBe("greenhouse");
      expect(setting).toHaveProperty(
        "warning",
        expect.stringContaining("only runs under next dev")
      );
    }
  );
});

describe("loadDemoLiveSnapshot", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "demo-snapshot-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("serves the bundled sample through the live selection, labelled as a snapshot", async () => {
    const batch = await loadDemoLiveSnapshot(path.resolve(DEFAULT_DEMO_LIVE_SNAPSHOT), NOW);
    expect(batch.source).toBe("snapshot");
    expect(batch.totalOpenings).toBe(10);
    expect(batch.jobs).toHaveLength(DEMO_LIVE_BATCH_SIZE);
    expect(batch.jobs.slice(0, 2).map((job) => job.title)).toEqual([
      "Frontend Engineer, Admin Console",
      "Senior Frontend Engineer, Design Systems",
    ]);
    // Links point to the real board page, not made-up postings.
    for (const job of batch.jobs) expect(job.url).toBe("https://job-boards.greenhouse.io/tailscale");
    // What the browser store receives is a valid batch, and it stays a snapshot.
    expect(parseDemoLiveBatch(JSON.parse(JSON.stringify(batch)))).toEqual(batch);
  });

  it("reads a saved real response and selects from it exactly like the live route", async () => {
    const file = path.join(dir, "greenhouse.json");
    await writeFile(file, JSON.stringify(boardList));
    expect(await loadDemoLiveSnapshot(file, NOW)).toEqual({
      ...pickDemoLiveBatch(boardList, NOW),
      source: "snapshot",
    });
  });

  it("explains a missing file, bad JSON, or a file that is not a job list", async () => {
    await expect(loadDemoLiveSnapshot(path.join(dir, "missing.json"))).rejects.toThrow(
      /could not be read \(ENOENT\)/
    );
    const bad = path.join(dir, "bad.json");
    await writeFile(bad, "<html>");
    await expect(loadDemoLiveSnapshot(bad)).rejects.toThrow("is not valid JSON");
    const wrong = path.join(dir, "wrong.json");
    await writeFile(wrong, JSON.stringify({ status: 404, error: "Not found" }));
    await expect(loadDemoLiveSnapshot(wrong)).rejects.toThrow(DemoLiveJobsError);
  });
});

describe("parseDemoLiveBatch source", () => {
  const live = pickDemoLiveBatch(boardList, NOW);

  it("keeps the source, and treats batches without one as live", () => {
    expect(parseDemoLiveBatch({ ...live, source: "snapshot" })?.source).toBe("snapshot");
    const { source: _source, ...withoutSource } = live;
    expect(parseDemoLiveBatch(withoutSource)?.source).toBe("live");
  });

  it("rejects an unknown source", () => {
    expect(parseDemoLiveBatch({ ...live, source: "fixture" })).toBeNull();
  });
});

describe("GET /api/demo/live-jobs with DEMO_LIVE_JOBS_SNAPSHOT", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function route() {
    return import("@/app/api/demo/live-jobs/route");
  }

  it("serves the snapshot under next dev without calling Greenhouse or caching", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEMO_LIVE_JOBS_SNAPSHOT", "1");
    const { GET } = await route();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.source).toBe("snapshot");
    expect(body.jobs).toHaveLength(DEMO_LIVE_BATCH_SIZE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 502 with the usual message when the snapshot file is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEMO_LIVE_JOBS_SNAPSHOT", "does/not/exist.json");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await route();
    const response = await GET();
    expect(response.status).toBe(502);
    expect(error).toHaveBeenCalledWith(
      "[demo] live jobs unavailable",
      expect.stringContaining("could not be read (ENOENT)")
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores the variable in production: calls Greenhouse and warns once", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_LIVE_JOBS_SNAPSHOT", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(boardList), { headers: { "content-type": "application/json" } })
    );
    const { GET } = await route();
    const first = await GET();
    await GET();
    expect((await first.json()).source).toBe("live");
    expect(first.headers.get("cache-control")).toContain("s-maxage=");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("DEMO_LIVE_JOBS_SNAPSHOT is set but ignored");
  });
});
