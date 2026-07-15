import { describe, it, expect, vi } from "vitest";
import { persistDiscoveredJob } from "@/modules/ingestion/persist-job";

describe("persistDiscoveredJob", () => {
  it("returns existing job without inserting when duplicate", async () => {
    const existing = { id: "existing-job" };
    const db = {
      query: {
        jobs: {
          findFirst: vi.fn().mockResolvedValue(existing),
        },
        companies: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
    };

    const result = await persistDiscoveredJob(
      db as never,
      "user-1",
      {
        company: "Acme",
        title: "Engineer",
        description: "Build things",
        responsibilities: [],
        requiredQualifications: [],
        preferredQualifications: [],
        technologies: [],
        sourceJobId: "123",
        jobUrl: "https://example.com/j/123",
      },
      { provider: "greenhouse", sourceUrl: "https://example.com/j/123", sourceJobId: "123" }
    );

    expect(result).toEqual({ jobId: "existing-job", isNew: false });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
