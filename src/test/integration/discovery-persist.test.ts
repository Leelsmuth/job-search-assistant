import { describe, it, expect, vi } from "vitest";
import { persistDiscoveredJob } from "@/modules/ingestion/persist-job";
import { hashJobDescription } from "@/modules/ingestion/description-hash";

describe("persistDiscoveredJob", () => {
  it("returns existing job without inserting when duplicate content unchanged", async () => {
    const description = "Build things";
    const existing = {
      id: "existing-job",
      descriptionHash: hashJobDescription(description),
    };
    const db = {
      query: {
        jobs: {
          findFirst: vi.fn().mockResolvedValue(existing),
        },
        companies: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const result = await persistDiscoveredJob(
      db as never,
      "user-1",
      {
        company: "Acme",
        title: "Engineer",
        description,
        responsibilities: [],
        requiredQualifications: [],
        preferredQualifications: [],
        technologies: [],
        sourceJobId: "123",
        jobUrl: "https://example.com/j/123",
      },
      { provider: "greenhouse", sourceUrl: "https://example.com/j/123", sourceJobId: "123" }
    );

    expect(result).toEqual({
      jobId: "existing-job",
      isNew: false,
      contentUnchanged: true,
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
