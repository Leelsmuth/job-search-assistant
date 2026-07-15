import { describe, it, expect } from "vitest";
import {
  classifyJobLocation,
  extractObservedSignals,
} from "@/modules/discovery/registry/job-signals";
import type { NormalizedJob } from "@/modules/ingestion/types";

function job(partial: Partial<NormalizedJob>): NormalizedJob {
  return {
    company: "Test Co",
    title: "Software Engineer",
    description: "Build things",
    responsibilities: [],
    requiredQualifications: [],
    preferredQualifications: [],
    technologies: [],
    salaryCurrency: "CAD",
    ...partial,
  };
}

describe("classifyJobLocation", () => {
  it("detects remote Canada explicitly", () => {
    expect(
      classifyJobLocation(job({ location: "Remote - Canada", workplaceType: "remote" }))
    ).toBe("remote-canada");
  });

  it("does not assume global remote is Canada", () => {
    expect(classifyJobLocation(job({ location: "Remote", workplaceType: "remote" }))).toBe(
      "remote-unknown"
    );
  });

  it("detects US-only remote", () => {
    expect(
      classifyJobLocation(job({ location: "Remote (US only)", workplaceType: "remote" }))
    ).toBe("remote-us");
  });
});

describe("extractObservedSignals", () => {
  it("counts frontend and Canada jobs from titles and locations", () => {
    const signals = extractObservedSignals([
      job({
        title: "Frontend Engineer",
        location: "Toronto, Canada",
        description: "React TypeScript",
        technologies: ["React", "TypeScript"],
      }),
      job({
        title: "Backend Engineer",
        location: "Remote - Canada",
        workplaceType: "remote",
      }),
      job({
        title: "Data Scientist",
        location: "San Francisco",
      }),
    ]);

    expect(signals.hasCanadaJobs).toBe(true);
    expect(signals.hasRemoteCanadaJobs).toBe(true);
    expect(signals.hasFrontendJobs).toBe(true);
    expect(signals.hasReactJobs).toBe(true);
    expect(signals.frontendJobCount).toBe(1);
    expect(signals.canadaJobCount).toBe(2);
    expect(signals.remoteCanadaJobCount).toBe(1);
  });
});
