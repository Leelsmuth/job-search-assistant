import { describe, it, expect } from "vitest";
import { clampJobForImport } from "@/modules/ingestion/clamp-import-job";
import {
  confirmJobImportSchema,
  jobImportMetaSchema,
  MAX_RAW_PAYLOAD_BYTES,
} from "@/modules/ingestion/types";

describe("confirmJobImportSchema", () => {
  const validJob = {
    company: "Acme",
    title: "Senior Engineer",
    description: "Build things with React.",
    responsibilities: [],
    requiredQualifications: [],
    preferredQualifications: [],
    technologies: ["React"],
    salaryCurrency: "CAD",
  };

  it("accepts valid normalized jobs", () => {
    expect(confirmJobImportSchema.parse(validJob).title).toBe("Senior Engineer");
  });

  it("rejects oversized descriptions", () => {
    expect(() =>
      confirmJobImportSchema.parse({
        ...validJob,
        description: "x".repeat(50_001),
      })
    ).toThrow();
  });

  it("caps list field lengths", () => {
    expect(() =>
      confirmJobImportSchema.parse({
        ...validJob,
        technologies: Array.from({ length: 51 }, (_, i) => `tech-${i}`),
      })
    ).toThrow();
  });

  it("splits oversized qualifications instead of rejecting the job", () => {
    const long = `Must have experience with ${"React ".repeat(800)}`;
    expect(long.length).toBeGreaterThan(2000);

    const parsed = confirmJobImportSchema.parse(
      clampJobForImport({
        ...validJob,
        requiredQualifications: [long],
        preferredQualifications: ["x".repeat(5000)],
      })
    );

    expect(parsed.requiredQualifications.length).toBeGreaterThan(1);
    expect(parsed.requiredQualifications.join(" ")).toContain("React");
    for (const item of [
      ...parsed.requiredQualifications,
      ...parsed.preferredQualifications,
    ]) {
      expect(item.length).toBeLessThanOrEqual(2000);
    }
  });
});

describe("jobImportMetaSchema", () => {
  it("accepts known providers", () => {
    expect(jobImportMetaSchema.parse({ provider: "greenhouse" }).provider).toBe("greenhouse");
    expect(jobImportMetaSchema.parse({ provider: "workday" }).provider).toBe("workday");
  });

  it("rejects unknown providers", () => {
    expect(() => jobImportMetaSchema.parse({ provider: "unknown" })).toThrow();
  });

  it("documents raw payload byte limit", () => {
    expect(MAX_RAW_PAYLOAD_BYTES).toBe(100_000);
  });
});
