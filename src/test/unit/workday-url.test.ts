import { describe, expect, it } from "vitest";
import { parseWorkdayUrl } from "@/modules/ingestion/board-url";

describe("parseWorkdayUrl", () => {
  it("reads tenant, Workday cluster, and site from a careers URL", () => {
    const parsed = parseWorkdayUrl(
      "https://shopify.wd3.myworkdayjobs.com/en-US/ExternalCareers/"
    );
    expect(parsed).toMatchObject({
      tenant: "shopify",
      cluster: "wd3",
      site: "ExternalCareers",
      boardSlug: "wd3/shopify/ExternalCareers",
      boardUrl: "https://shopify.wd3.myworkdayjobs.com/ExternalCareers",
      isSingleJob: false,
    });
  });

  it("keeps the job path for a single posting", () => {
    const parsed = parseWorkdayUrl(
      "https://acme.wd1.myworkdayjobs.com/en-CA/Careers/job/Toronto/Frontend-Engineer_JR42"
    );
    expect(parsed?.tenant).toBe("acme");
    expect(parsed?.cluster).toBe("wd1");
    expect(parsed?.site).toBe("Careers");
    expect(parsed?.isSingleJob).toBe(true);
    expect(parsed?.externalPath).toBe("/job/Toronto/Frontend-Engineer_JR42");
  });

  it("rejects URLs that are not Workday CXS boards", () => {
    expect(parseWorkdayUrl("https://boards.greenhouse.io/stripe")).toBeNull();
    expect(parseWorkdayUrl("https://example.com/careers")).toBeNull();
  });
});