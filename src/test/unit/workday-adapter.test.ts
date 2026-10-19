import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeWorkdayDetail,
  normalizeWorkdayListJob,
  parseWorkdayPostedDate,
  WORKDAY_FRONTEND_SEARCHES,
  WORKDAY_MAX_PAGES_PER_SEARCH,
  workdayAdapter,
} from "@/modules/ingestion/workday";
import workdayJob from "@/test/fixtures/boards/workday-job.json";

const BOARD_URL = "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite";
const JOB_URL =
  "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Toronto/Software-Engineer_JR999";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe("workdayAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("detects Workday URLs", async () => {
    const result = await workdayAdapter.detect(BOARD_URL);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("normalizes a single Workday job from a detail payload", async () => {
    const normalized = await workdayAdapter.normalize({
      provider: "workday",
      sourceUrl: JOB_URL,
      sourceJobId: workdayJob.jobReqId,
      rawText: workdayJob.jobDescription,
      rawPayload: {
        job: workdayJob,
        companyName: "Nvidia",
        jobUrl: JOB_URL,
      },
    });

    expect(normalized.title).toBe("Software Engineer");
    expect(normalized.company).toBe("Nvidia");
    expect(normalized.sourceJobId).toBe("JR999");
    expect(normalized.description).toContain("React");
    expect(normalized.employmentType).toBe("Full time");
    expect(normalized.jobUrl).toBe(JOB_URL);
  });

  it("pages the public jobs list", async () => {
    const page = (offset: number, count: number) => ({
      total: 21,
      jobPostings: Array.from({ length: count }, (_, index) => {
        const id = offset + index;
        return {
          title: `Role ${id}`,
          externalPath: `/job/Toronto/Role_${id}`,
          locationsText: "Toronto",
          bulletFields: [`JR${id}`],
        };
      }),
    });

    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(init?.method).toBe("POST");
      return jsonResponse(body.offset === 0 ? page(0, 20) : page(20, 1));
    });

    const raw = await workdayAdapter.fetch(BOARD_URL);
    expect(raw.provider).toBe("workday");
    expect(raw.sourceUrl).toBe(
      "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"
    );
    expect((raw.rawPayload as { jobs: unknown[] }).jobs).toHaveLength(21);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("reports a Workday rate limit instead of paging further", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as Response);

    await expect(workdayAdapter.fetch(BOARD_URL)).rejects.toThrow(/rate limit/i);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches a single posting from the detail endpoint", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse({ jobPostingInfo: workdayJob })
    );

    const raw = await workdayAdapter.fetch(JOB_URL);
    expect(raw.provider).toBe("workday");
    expect(raw.sourceJobId).toBe("JR999");
    expect(raw.rawText).toContain("React");

    const [calledUrl, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(calledUrl)).toBe(
      "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/Toronto/Software-Engineer_JR999"
    );
    expect(init?.method).toBe("GET");
  });

  it("does not follow a redirect off the Workday allowlist", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 303,
      headers: { get: (name: string) => (name.toLowerCase() === "location" ? "https://evil.example/job" : null) },
      json: async () => ({}),
    } as unknown as Response);

    await expect(workdayAdapter.fetch(BOARD_URL)).rejects.toThrow(
      /allowlisted Workday jobs host \(evil\.example\)/i
    );
    const urls = vi.mocked(global.fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.length).toBeGreaterThan(1);
    expect(urls.every((url) => url.includes("myworkdayjobs.com"))).toBe(true);
    expect(urls.some((url) => url.includes("evil.example"))).toBe(false);
  });

  it("retries a CXS POST after a 303 to an unsafe host and keeps the JSON", async () => {
    let calls = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 303,
          headers: {
            get: (name: string) => (name.toLowerCase() === "location" ? "https://evil.example/job" : null),
          },
          json: async () => ({}),
        } as unknown as Response;
      }
      expect(String(input)).toContain("myworkdayjobs.com/wday/cxs/");
      return jsonResponse({
        total: 1,
        jobPostings: [
          {
            title: "Frontend Engineer",
            externalPath: "/job/Toronto/Frontend-Engineer_JR1",
            locationsText: "Toronto",
            bulletFields: ["JR1"],
          },
        ],
      });
    });

    const raw = await workdayAdapter.fetch(BOARD_URL);
    const jobs = (raw.rawPayload as { jobs: Array<{ title: string }> }).jobs;
    expect(jobs.map((job) => job.title)).toEqual(["Frontend Engineer"]);
    expect(calls).toBe(2);
  });

  it("does not request a detail redirect off the Workday allowlist", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 302,
      headers: { get: (name: string) => (name.toLowerCase() === "location" ? "https://evil.example/steal" : null) },
      json: async () => ({}),
    } as unknown as Response);

    await expect(workdayAdapter.fetch(JOB_URL)).rejects.toThrow(/evil\.example/i);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(global.fetch).mock.calls[0][0])).toContain("myworkdayjobs.com");
  });

  it("searches frontend keywords and dedupes a large board by externalPath", async () => {
    const searches: string[] = [];
    const shared = {
      title: "Frontend Engineer",
      externalPath: "/job/Toronto/Frontend-Engineer_JR1",
      locationsText: "Toronto, Ontario",
      postedOn: "Posted 12 Days Ago",
      remoteType: "Hybrid",
      bulletFields: ["JR1"],
    };
    const reactOnly = {
      title: "React Developer",
      externalPath: "/job/Toronto/React-Developer_JR2",
      locationsText: "Toronto, Ontario",
      bulletFields: ["JR2"],
    };

    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      searches.push(body.searchText);
      if (body.searchText === "") {
        return jsonResponse({
          total: 2000,
          jobPostings: [{ title: "Teller", externalPath: "/job/Branch/Teller_1", bulletFields: ["T1"] }],
        });
      }
      if (body.searchText === "frontend" || body.searchText === "front end") {
        return jsonResponse({ total: 1, jobPostings: [shared] });
      }
      if (body.searchText === "react") {
        return jsonResponse({ total: 2, jobPostings: [shared, reactOnly] });
      }
      return jsonResponse({ total: 0, jobPostings: [] });
    });

    const raw = await workdayAdapter.fetch(BOARD_URL);
    const jobs = (raw.rawPayload as { jobs: Array<{ title: string; externalPath: string }> }).jobs;
    expect(jobs.map((job) => job.externalPath)).toEqual([
      "/job/Toronto/Frontend-Engineer_JR1",
      "/job/Toronto/React-Developer_JR2",
    ]);
    expect(jobs.map((job) => job.title)).not.toContain("Teller");
    expect(searches[0]).toBe("");
    expect(searches.slice(1)).toEqual([...WORKDAY_FRONTEND_SEARCHES]);
  });

  it("keeps a recent engineering role from the date-sorted pages of a large board", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.searchText === "" && body.offset === 0) {
        return jsonResponse({
          total: 2000,
          jobPostings: [
            {
              title: "Teller",
              externalPath: "/job/Branch/Teller_1",
              postedOn: "Posted Today",
              bulletFields: ["T1"],
            },
            {
              title: "Full Stack Developer",
              externalPath: "/job/Toronto/Full-Stack-Developer_JR9",
              locationsText: "Toronto, Ontario",
              postedOn: "Posted Today",
              bulletFields: ["JR9"],
            },
          ],
        });
      }
      return jsonResponse({ total: 0, jobPostings: [] });
    });

    const raw = await workdayAdapter.fetch(BOARD_URL);
    const jobs = (raw.rawPayload as { jobs: Array<{ title: string }> }).jobs;
    expect(jobs.map((job) => job.title)).toEqual(["Full Stack Developer"]);
  });

  it("does not page past the first results when a keyword matches most of the board", async () => {
    const reactOffsets: number[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.searchText === "") {
        return jsonResponse({ total: 1600, jobPostings: [] });
      }
      if (body.searchText !== "react") {
        return jsonResponse({ total: 0, jobPostings: [] });
      }
      reactOffsets.push(body.offset);
      return jsonResponse({
        total: 1600,
        jobPostings: Array.from({ length: 20 }, (_, index) => {
          const id = body.offset + index;
          return {
            title: `React Role ${id}`,
            externalPath: `/job/Toronto/React-Role_${id}`,
            bulletFields: [`JR${id}`],
          };
        }),
      });
    });

    const raw = await workdayAdapter.fetch(BOARD_URL);
    const jobs = (raw.rawPayload as { jobs: unknown[] }).jobs;
    expect(reactOffsets).toEqual([0]);
    expect(jobs).toHaveLength(20);
  });

  it("pages a small keyword search up to the per-search cap", async () => {
    const offsets: number[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.searchText === "") {
        return jsonResponse({ total: 800, jobPostings: [] });
      }
      if (body.searchText !== "frontend") {
        return jsonResponse({ total: 0, jobPostings: [] });
      }
      offsets.push(body.offset);
      const count = body.offset === 0 ? 20 : 5;
      return jsonResponse({
        total: 25,
        jobPostings: Array.from({ length: count }, (_, index) => {
          const id = body.offset + index;
          return {
            title: `Frontend Role ${id}`,
            externalPath: `/job/Toronto/Frontend-Role_${id}`,
            bulletFields: [`JR${id}`],
          };
        }),
      });
    });

    const raw = await workdayAdapter.fetch(BOARD_URL);
    const jobs = (raw.rawPayload as { jobs: unknown[] }).jobs;
    expect(offsets).toEqual(
      Array.from({ length: WORKDAY_MAX_PAGES_PER_SEARCH }, (_, page) => page * 20)
    );
    expect(jobs).toHaveLength(25);
  });
});

describe("Workday normalization", () => {
  const now = new Date("2026-10-14T15:00:00.000Z");

  it("converts relative posted dates", () => {
    expect(parseWorkdayPostedDate("Posted Today", now)).toBe("2026-10-14T00:00:00.000Z");
    expect(parseWorkdayPostedDate("Posted Yesterday", now)).toBe("2026-10-13T00:00:00.000Z");
    expect(parseWorkdayPostedDate("Posted 12 Days Ago", now)).toBe("2026-10-02T00:00:00.000Z");
    expect(parseWorkdayPostedDate("Posted 1 Day Ago", now)).toBe("2026-10-13T00:00:00.000Z");
    expect(parseWorkdayPostedDate("Posted 30+ Days Ago", now)).toBe("2026-09-14T00:00:00.000Z");
    expect(parseWorkdayPostedDate("2026-10-02", now)).toBe("2026-10-02T00:00:00.000Z");
  });

  it("normalizes list locations, workplace, and posted date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    let job: ReturnType<typeof normalizeWorkdayListJob>;
    try {
      job = normalizeWorkdayListJob(
        {
          title: "Frontend Engineer",
          externalPath: "/job/Toronto/Frontend-Engineer_JR1",
          locationsText: "Toronto, Ontario",
          postedOn: "Posted 12 Days Ago",
          remoteType: "Hybrid",
          bulletFields: ["Engineering", "JR1"],
        },
        "TD",
        "https://td.wd3.myworkdayjobs.com/TD_Bank_Careers"
      );
    } finally {
      vi.useRealTimers();
    }

    expect(job.title).toBe("Frontend Engineer");
    expect(job.location).toBe("Toronto, Ontario");
    expect(job.workplaceType).toBe("hybrid");
    expect(job.sourceJobId).toBe("JR1");
    expect(job.datePosted).toBe("2026-10-02T00:00:00.000Z");
    expect(job.jobUrl).toBe(
      "https://td.wd3.myworkdayjobs.com/TD_Bank_Careers/job/Toronto/Frontend-Engineer_JR1"
    );
  });

  it("joins detail locations and prefers the posting start date", () => {
    const job = normalizeWorkdayDetail(
      {
        title: "Senior Software Engineer",
        jobDescription: "<p>Build React interfaces for Canadian clients.</p>",
        location: "Waterloo, Ontario",
        additionalLocations: ["Sun Life Toronto Atria", "Waterloo, Ontario"],
        remoteType: "Onsite",
        timeType: "Full time",
        jobReqId: "JR00127987",
        postedOn: "Posted Yesterday",
        startDate: "2026-10-13",
        externalUrl:
          "https://sunlife.wd3.myworkdayjobs.com/Experienced-Jobs/job/Waterloo-Ontario/Senior-Software-Engineer_JR00127987-1",
      },
      "Sun Life",
      "https://sunlife.wd3.myworkdayjobs.com/Experienced-Jobs/job/Waterloo-Ontario/Senior-Software-Engineer_JR00127987-1"
    );

    expect(job.location).toBe("Waterloo, Ontario; Sun Life Toronto Atria");
    expect(job.workplaceType).toBe("on_site");
    expect(job.datePosted).toBe("2026-10-13T00:00:00.000Z");
    expect(job.description).toContain("React");
    expect(job.jobUrl).toContain("sunlife.wd3.myworkdayjobs.com");
    expect(job.sourceJobId).toBe("JR00127987");
  });

  it("reads a requisition id that is not the first bullet", () => {
    const job = normalizeWorkdayListJob(
      {
        title: "Senior Software Engineer II",
        externalPath: "/job/India-Bengaluru/Senior-Software-Engineer-II_JREQ202434",
        postedOn: "Posted 2 Days Ago",
        remoteType: "Hybrid",
        bulletFields: ["Bangalore", "Karnataka", "JREQ202434"],
      },
      "Thomson Reuters",
      "https://thomsonreuters.wd5.myworkdayjobs.com/External_Career_Site"
    );
    expect(job.sourceJobId).toBe("JREQ202434");
    expect(job.location).toBe("Bangalore, Karnataka");
    expect(job.workplaceType).toBe("hybrid");
  });
});
