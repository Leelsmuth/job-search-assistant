import { describe, it, expect } from "vitest";
import greenhouseBoard from "@/test/fixtures/boards/greenhouse-board.json";
import leverBoard from "@/test/fixtures/boards/lever-board.json";
import ashbyBoard from "@/test/fixtures/boards/ashby-board.json";
import { normalizeBoardJobs } from "@/modules/ingestion/board-normalize";

describe("normalizeBoardJobs", () => {
  it("splits Greenhouse board into distinct jobs", () => {
    const jobs = normalizeBoardJobs({
      provider: "greenhouse",
      sourceUrl: "https://boards.greenhouse.io/acme",
      rawText: "",
      rawPayload: { ...greenhouseBoard, companyName: "Acme", board: "acme" },
    });

    expect(jobs).toHaveLength(3);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["111", "222", "333"]);
    expect(jobs[0].title).toBe("Senior Frontend Engineer");
    expect(jobs[0].jobUrl).toContain("greenhouse.io/acme/jobs/111");
  });

  it("splits Lever board into distinct jobs", () => {
    const jobs = normalizeBoardJobs({
      provider: "lever",
      sourceUrl: "https://jobs.lever.co/acme",
      rawText: "",
      rawPayload: leverBoard,
    });

    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["aaa-111", "bbb-222"]);
    expect(jobs[0].company).toBe("Engineering");
  });

  it("splits Ashby board into distinct jobs", () => {
    const jobs = normalizeBoardJobs({
      provider: "ashby",
      sourceUrl: "https://jobs.ashbyhq.com/acme",
      rawText: "",
      rawPayload: { ...ashbyBoard, companyName: "Acme", board: "acme" },
    });

    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["ashby-111", "ashby-222"]);
    expect(jobs[1].workplaceType).toBe("remote");
  });
});
