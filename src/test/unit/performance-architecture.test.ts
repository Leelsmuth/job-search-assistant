import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashJobDescription } from "@/modules/ingestion/description-hash";
import { computeMatchAnalysisInputHash } from "@/modules/matching/match-analysis-cache";
import { fetchJobsFeed } from "@/modules/jobs/jobs-feed-service";

describe("performance architecture guards", () => {
  it("jobs feed service enforces pagination limit", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = {
      query: {
        candidateProfiles: {
          findFirst: vi.fn().mockResolvedValue({ updatedAt: new Date() }),
        },
        jobs: { findMany },
      },
    };

    await fetchJobsFeed(db as never, "user-1", { limit: 50 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 51 })
    );
  });

  it("persistDiscoveredJob skips update when description hash unchanged", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/ingestion/persist-job.ts"),
      "utf8"
    );
    expect(source).toContain("contentUnchanged: true");
    expect(source).toContain("existing.descriptionHash === nextHash");
  });

  it("resume ingestion uses extraction hash cache lookup", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/resumes/ingestion/resume-ingestion-service.ts"),
      "utf8"
    );
    expect(source).toContain("extractionHash");
    expect(source).toContain("fromCache: true");
  });

  it("match analysis cache key includes profile and job hash inputs", () => {
    const hash = computeMatchAnalysisInputHash({
      jobDescriptionHash: hashJobDescription("Same description"),
      profileUpdatedAt: new Date("2024-01-01"),
    });
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it("poll board decouples ingestion from inline match", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/discovery/poll-board.ts"),
      "utf8"
    );
    expect(source).not.toContain("runAndSaveMatchAnalysisDb");
    expect(source).toContain("queuedForMatch");
  });
});
