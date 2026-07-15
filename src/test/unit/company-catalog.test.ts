import { describe, it, expect } from "vitest";
import { filterCatalog } from "@/modules/discovery/company-catalog";
import type { CompanyJobSource } from "../../../data/company-sources.schema";

const sample: CompanyJobSource[] = [
  {
    id: "stripe",
    companyName: "Stripe",
    companySlug: "stripe",
    atsProvider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/stripe",
    boardSlug: "stripe",
    headquartersCountry: "US",
    industries: ["fintech"],
    enabled: true,
    verificationStatus: "verified",
    observedSignals: {
      hasCanadaJobs: true,
      hasRemoteCanadaJobs: false,
      hasFrontendJobs: true,
      hasReactJobs: true,
      hasTypeScriptJobs: true,
      hasRemoteJobs: true,
      frontendJobCount: 5,
      reactJobCount: 3,
      typescriptJobCount: 4,
      canadaJobCount: 2,
      remoteCanadaJobCount: 0,
      analyzedAt: "2026-01-01T00:00:00.000Z",
    },
  },
  {
    id: "jobber",
    companyName: "Jobber",
    companySlug: "jobber",
    atsProvider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/jobber",
    boardSlug: "jobber",
    headquartersCountry: "CA",
    industries: ["saas"],
    enabled: true,
    verificationStatus: "verified",
    observedSignals: {
      hasCanadaJobs: true,
      hasRemoteCanadaJobs: true,
      hasFrontendJobs: false,
      hasReactJobs: false,
      hasTypeScriptJobs: false,
      hasRemoteJobs: true,
      frontendJobCount: 0,
      reactJobCount: 0,
      typescriptJobCount: 0,
      canadaJobCount: 10,
      remoteCanadaJobCount: 3,
      analyzedAt: "2026-01-01T00:00:00.000Z",
    },
  },
];

describe("filterCatalog", () => {
  it("filters by provider", () => {
    expect(filterCatalog(sample, { provider: "ashby" })).toHaveLength(1);
  });

  it("filters by headquarters country", () => {
    expect(filterCatalog(sample, { country: "CA" })).toHaveLength(1);
  });

  it("filters by industry", () => {
    expect(filterCatalog(sample, { industry: "fintech" })).toHaveLength(1);
  });

  it("filters by observed signal", () => {
    expect(filterCatalog(sample, { signal: "hasRemoteCanadaJobs" })).toHaveLength(1);
  });

  it("searches by company name", () => {
    expect(filterCatalog(sample, { search: "strip" })).toHaveLength(1);
  });
});
