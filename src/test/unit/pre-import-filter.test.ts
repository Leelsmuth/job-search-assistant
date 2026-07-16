import { describe, it, expect } from "vitest";
import { shouldImportDiscoveredJob } from "@/modules/discovery/pre-import-filter";

describe("shouldImportDiscoveredJob", () => {
  const baseJob = {
    company: "Acme",
    title: "Senior Frontend Engineer",
    location: "Remote - Canada",
    workplaceType: "remote" as const,
    description: "Build React apps with TypeScript.",
    responsibilities: [],
    requiredQualifications: [],
    preferredQualifications: [],
    technologies: [],
    jobUrl: "https://example.com/job",
  };

  it("allows frontend remote Canada roles", () => {
    expect(shouldImportDiscoveredJob(baseJob).import).toBe(true);
  });

  it("blocks sales roles", () => {
    expect(
      shouldImportDiscoveredJob({ ...baseJob, title: "Account Executive" }).import
    ).toBe(false);
  });

  it("blocks on-site non-Canada roles without remote", () => {
    expect(
      shouldImportDiscoveredJob({
        ...baseJob,
        title: "Software Engineer",
        location: "San Francisco, CA",
        workplaceType: "on_site",
        description: "On-site only.",
      }).import
    ).toBe(false);
  });

  it("respects profile target titles", () => {
    expect(
      shouldImportDiscoveredJob(
        { ...baseJob, title: "Staff Platform Engineer" },
        { targetTitles: ["Frontend Engineer"], skills: [], evidence: [] }
      ).import
    ).toBe(false);
  });

  it("allows staff frontend engineer titles", () => {
    expect(
      shouldImportDiscoveredJob({
        ...baseJob,
        title: "Staff Software Engineer, Frontend",
      }).import
    ).toBe(true);
  });
});
