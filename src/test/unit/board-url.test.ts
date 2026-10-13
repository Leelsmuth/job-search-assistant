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
});
