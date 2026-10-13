import { describe, it, expect, vi, beforeEach } from "vitest";
import { workdayAdapter } from "@/modules/ingestion/workday";
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
});
