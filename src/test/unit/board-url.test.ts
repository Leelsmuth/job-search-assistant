import { describe, it, expect } from "vitest";
import {
  normalizeBoardUrl,
  parseBoardUrl,
  isSingleJobBoardUrl,
} from "@/modules/ingestion/board-url";

describe("board-url", () => {
  it("normalizes Greenhouse board with /jobs suffix", () => {
    const result = normalizeBoardUrl("https://boards.greenhouse.io/stripe/jobs");
    expect(result.provider).toBe("greenhouse");
    expect(result.boardSlug).toBe("stripe");
    expect(result.boardUrl).toBe("https://boards.greenhouse.io/stripe");
    expect(result.isSingleJob).toBe(false);
  });

  it("normalizes job-boards.greenhouse.io subdomain", () => {
    const result = normalizeBoardUrl("https://job-boards.greenhouse.io/notion");
    expect(result.boardSlug).toBe("notion");
    expect(result.boardUrl).toBe("https://job-boards.greenhouse.io/notion");
  });

  it("rejects Greenhouse single job URL for board polling", () => {
    expect(() =>
      normalizeBoardUrl("https://boards.greenhouse.io/stripe/jobs/123456")
    ).toThrow(/single job/i);
  });

  it("normalizes Lever board URL", () => {
    const result = normalizeBoardUrl("https://jobs.lever.co/netflix/");
    expect(result.provider).toBe("lever");
    expect(result.boardSlug).toBe("netflix");
  });

  it("normalizes Ashby board URL", () => {
    const result = normalizeBoardUrl("https://jobs.ashbyhq.com/notion");
    expect(result.provider).toBe("ashby");
    expect(result.boardSlug).toBe("notion");
  });

  it("normalizes a Workday board and drops the locale prefix", () => {
    const result = normalizeBoardUrl(
      "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/"
    );
    expect(result.provider).toBe("workday");
    expect(result.boardSlug).toBe("wd5/nvidia/NVIDIAExternalCareerSite");
    expect(result.boardUrl).toBe(
      "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"
    );
    expect(result.isSingleJob).toBe(false);
  });

  it("lowercases the Workday cluster in the slug", () => {
    const result = normalizeBoardUrl("https://acme.WD5.myworkdayjobs.com/External");
    expect(result.boardSlug).toBe("wd5/acme/External");
    expect(result.boardUrl).toBe("https://acme.wd5.myworkdayjobs.com/External");
  });

  it("rejects a Workday single job URL for board polling", () => {
    expect(() =>
      normalizeBoardUrl(
        "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Toronto/Software-Engineer_JR123"
      )
    ).toThrow(/single job/i);
  });

  it("detects single job URLs", () => {
    expect(isSingleJobBoardUrl("https://jobs.lever.co/acme/abc-123-def")).toBe(true);
    expect(isSingleJobBoardUrl("https://boards.greenhouse.io/acme/jobs/99")).toBe(true);
    expect(isSingleJobBoardUrl("https://boards.greenhouse.io/acme")).toBe(false);
    expect(
      isSingleJobBoardUrl(
        "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/Toronto/Engineer_JR1"
      )
    ).toBe(true);
    expect(
      isSingleJobBoardUrl("https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite")
    ).toBe(false);
  });

  it("parseBoardUrl returns null for unknown URLs", () => {
    expect(parseBoardUrl("https://example.com/careers")).toBeNull();
  });

  it("reads the company from a Greenhouse embed URL", () => {
    const result = normalizeBoardUrl(
      "https://boards.greenhouse.io/embed/job_board?for=stripe"
    );
    expect(result.provider).toBe("greenhouse");
    expect(result.boardSlug).toBe("stripe");
    expect(result.boardUrl).toBe("https://boards.greenhouse.io/stripe");
    expect(result.isSingleJob).toBe(false);
  });

  it("accepts a regional Greenhouse host and a missing scheme", () => {
    const result = normalizeBoardUrl("job-boards.eu.greenhouse.io/notion/jobs");
    expect(result.provider).toBe("greenhouse");
    expect(result.boardSlug).toBe("notion");
    expect(result.boardUrl).toBe("https://job-boards.eu.greenhouse.io/notion");
  });

  it("rejects a Greenhouse single-job embed", () => {
    expect(() =>
      normalizeBoardUrl("https://boards.greenhouse.io/embed/job_app?for=stripe&token=123")
    ).toThrow(/single job/i);
  });

  it("rejects a Greenhouse embed that has no company token", () => {
    expect(() => normalizeBoardUrl("https://boards.greenhouse.io/embed/job_board")).toThrow(
      /Invalid board URL/i
    );
  });

  it("accepts Lever and Ashby board links without a scheme", () => {
    expect(normalizeBoardUrl("jobs.lever.co/netflix").boardUrl).toBe(
      "https://jobs.lever.co/netflix"
    );
    expect(normalizeBoardUrl("https://jobs.eu.lever.co/netflix/").boardUrl).toBe(
      "https://jobs.lever.co/netflix"
    );
    expect(normalizeBoardUrl("https://api.lever.co/v0/postings/netflix?mode=json").boardSlug).toBe(
      "netflix"
    );
    expect(normalizeBoardUrl("jobs.ashbyhq.com/notion/embed").boardUrl).toBe(
      "https://jobs.ashbyhq.com/notion"
    );
  });

  it("accepts a Workday board pasted without a scheme", () => {
    const result = normalizeBoardUrl(
      "nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/"
    );
    expect(result.provider).toBe("workday");
    expect(result.boardSlug).toBe("wd5/nvidia/NVIDIAExternalCareerSite");
    expect(result.boardUrl).toBe(
      "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"
    );
  });

  it("reads a Workday CXS board path", () => {
    const result = normalizeBoardUrl(
      "https://shopify.wd3.myworkdayjobs.com/wday/cxs/shopify/ExternalCareers/jobs"
    );
    expect(result.provider).toBe("workday");
    expect(result.boardSlug).toBe("wd3/shopify/ExternalCareers");
    expect(result.isSingleJob).toBe(false);
  });
});
