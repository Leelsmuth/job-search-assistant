import { describe, it, expect, vi, beforeEach } from "vitest";
import { ashbyAdapter } from "@/modules/ingestion/ashby";
import ashbyBoard from "@/test/fixtures/boards/ashby-board.json";

describe("ashbyAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("detects Ashby URLs", async () => {
    const result = await ashbyAdapter.detect("https://jobs.ashbyhq.com/notion");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("normalizes a single Ashby job from board payload", async () => {
    const job = ashbyBoard.jobs[0];
    const normalized = await ashbyAdapter.normalize({
      provider: "ashby",
      sourceUrl: job.jobUrl,
      sourceJobId: job.id,
      rawText: job.descriptionHtml,
      rawPayload: { job, companyName: "Acme" },
    });

    expect(normalized.title).toBe("Software Engineer");
    expect(normalized.sourceJobId).toBe("ashby-111");
    expect(normalized.jobUrl).toBe(job.jobUrl);
  });

  it("fetches board listings from public API", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ashbyBoard,
    } as Response);

    const raw = await ashbyAdapter.fetch("https://jobs.ashbyhq.com/acme");
    expect(raw.provider).toBe("ashby");
    expect((raw.rawPayload as { jobs: unknown[] }).jobs).toHaveLength(2);
  });
});
