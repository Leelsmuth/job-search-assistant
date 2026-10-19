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
    salaryCurrency: "CAD",
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
    const profile = { targetTitles: ["Frontend Engineer", "Full-Stack Engineer"], skills: [], evidence: [] };
    expect(
      shouldImportDiscoveredJob({ ...baseJob, title: "Staff Platform Engineer" }, profile).import
    ).toBe(false);
    expect(
      shouldImportDiscoveredJob({ ...baseJob, title: "Software Engineer II" }, profile).import
    ).toBe(false);
    expect(
      shouldImportDiscoveredJob(
        { ...baseJob, title: "Consultant, Full Stack Developer", location: "Toronto, ON", workplaceType: "on_site" },
        profile
      ).import
    ).toBe(true);
    expect(
      shouldImportDiscoveredJob(
        { ...baseJob, title: "Front End Engineer", location: "Toronto, ON", workplaceType: "hybrid" },
        profile
      ).import
    ).toBe(true);
    expect(
      shouldImportDiscoveredJob(
        {
          ...baseJob,
          title: "Senior Software Engineer, Full Stack",
          location: "Toronto, Ontario",
          workplaceType: "on_site",
        },
        profile
      ).import
    ).toBe(true);
  });

  it("blocks US-only remote roles unless the view opts in", () => {
    const job = {
      ...baseJob,
      location: "Remote (US only)",
      description: "Must be authorized to work in the United States.",
    };
    expect(shouldImportDiscoveredJob(job).import).toBe(false);
    expect(
      shouldImportDiscoveredJob(job, undefined, {
        includeHybridGta: true,
        includeOnsiteGta: true,
        showRemoteOther: true,
        showOutOfArea: false,
      }).import
    ).toBe(true);
  });

  it("allows GTA hybrid roles and blocks hybrid roles outside the GTA", () => {
    expect(
      shouldImportDiscoveredJob({
        ...baseJob,
        location: "Toronto, ON",
        workplaceType: "hybrid",
        description: "Hybrid in Toronto.",
      }).import
    ).toBe(true);
    expect(
      shouldImportDiscoveredJob({
        ...baseJob,
        location: "Vancouver, BC",
        workplaceType: "hybrid",
        description: "Hybrid in Vancouver.",
      }).import
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
