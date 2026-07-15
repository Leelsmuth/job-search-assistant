import { describe, it, expect, vi } from "vitest";
import { findExistingJob } from "@/modules/ingestion/persist-job";

describe("findExistingJob", () => {
  it("matches by sourceJobId first", async () => {
    const bySource = { id: "job-1", sourceJobId: "gh-123" };
    const db = {
      query: {
        jobs: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(bySource)
            .mockResolvedValueOnce(null),
        },
      },
    };

    const result = await findExistingJob(db as never, "user-1", {
      sourceJobId: "gh-123",
      jobUrl: "https://example.com/job",
    });

    expect(result).toBe(bySource);
  });

  it("falls back to jobUrl when sourceJobId misses", async () => {
    const byUrl = { id: "job-2", jobUrl: "https://example.com/job" };
    const db = {
      query: {
        jobs: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(byUrl),
        },
      },
    };

    const result = await findExistingJob(db as never, "user-1", {
      sourceJobId: "missing",
      jobUrl: "https://example.com/job",
    });

    expect(result).toBe(byUrl);
  });
});
