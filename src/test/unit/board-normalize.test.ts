import { describe, it, expect } from "vitest";
import greenhouseBoard from "@/test/fixtures/boards/greenhouse-board.json";
import leverBoard from "@/test/fixtures/boards/lever-board.json";
import ashbyBoard from "@/test/fixtures/boards/ashby-board.json";
import workdayBoard from "@/test/fixtures/boards/workday-board.json";
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

  it("splits a Workday board into distinct jobs", () => {
    const jobs = normalizeBoardJobs({
      provider: "workday",
      sourceUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
      rawText: "",
      rawPayload: {
        ...workdayBoard,
        companyName: "Nvidia",
        boardUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
      },
    });

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.sourceJobId)).toEqual(["JR111", "JR222"]);
    expect(jobs[0].title).toBe("Senior Frontend Engineer");
    expect(jobs[0].jobUrl).toBe(
      "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/Toronto/Senior-Frontend-Engineer_JR111"
    );
    expect(jobs[0].description).toContain("Toronto");
    expect(jobs[1].workplaceType).toBe("remote");
  });
});
