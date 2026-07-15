import { describe, it, expect } from "vitest";
import { filterCatalog } from "@/modules/discovery/company-catalog";
import type { CompanyJobSource } from "../../../data/company-sources.schema";

const sample: CompanyJobSource[] = [
  {
    id: "stripe",
    companyName: "Stripe",
    atsProvider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/stripe",
    boardSlug: "stripe",
    country: "GLOBAL",
    tags: ["remote-canada", "fintech"],
    enabled: true,
  },
  {
    id: "jobber",
    companyName: "Jobber",
    atsProvider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/jobber",
    boardSlug: "jobber",
    country: "CA",
    tags: ["remote-canada", "saas"],
    enabled: true,
  },
];

describe("filterCatalog", () => {
  it("filters by provider", () => {
    expect(filterCatalog(sample, { provider: "ashby" })).toHaveLength(1);
  });

  it("filters by country", () => {
    expect(filterCatalog(sample, { country: "CA" })).toHaveLength(1);
  });

  it("filters by tag", () => {
    expect(filterCatalog(sample, { tag: "fintech" })).toHaveLength(1);
  });

  it("searches by company name", () => {
    expect(filterCatalog(sample, { search: "strip" })).toHaveLength(1);
  });
});
