import { describe, expect, it } from "vitest";
import { providerPostedDate } from "@/modules/ingestion/posted-date";
import { parseWorkdayPostedDate } from "@/modules/ingestion/workday";

const NOW = new Date("2026-10-16T15:00:00.000Z");

describe("provider posted dates", () => {
  it("prefers Greenhouse first_published over updated_at", () => {
    expect(
      providerPostedDate(
        "greenhouse",
        { first_published: "2026-10-16T12:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" },
        NOW
      )
    ).toBe("2026-10-16T12:00:00.000Z");
    expect(
      providerPostedDate("greenhouse", { job: { updated_at: "2026-10-02T00:00:00.000Z" } }, NOW)
    ).toBe("2026-10-02T00:00:00.000Z");
  });

  it("reads Lever createdAt milliseconds", () => {
    expect(providerPostedDate("lever", { createdAt: Date.parse("2026-10-16T08:00:00.000Z") }, NOW)).toBe(
      "2026-10-16T08:00:00.000Z"
    );
  });

  it("reads Ashby publishedAt", () => {
    expect(providerPostedDate("ashby", { publishedAt: "2026-10-15T10:00:00.000Z" }, NOW)).toBe(
      "2026-10-15T10:00:00.000Z"
    );
  });

  it("converts Workday relative posted text", () => {
    expect(parseWorkdayPostedDate("Posted Today", NOW)).toBe("2026-10-16T00:00:00.000Z");
    expect(parseWorkdayPostedDate("Posted Yesterday", NOW)).toBe("2026-10-15T00:00:00.000Z");
    expect(parseWorkdayPostedDate("Posted 2 Days Ago", NOW)).toBe("2026-10-14T00:00:00.000Z");
    expect(providerPostedDate("workday", { postedOn: "Posted 2 Days Ago" }, NOW)).toBe(
      "2026-10-14T00:00:00.000Z"
    );
  });

  it("reads the newer board sources", () => {
    expect(providerPostedDate("smartrecruiters", { releasedDate: "2026-10-10T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-10T00:00:00.000Z"
    );
    expect(providerPostedDate("workable", { published_on: "2026-10-11T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-11T00:00:00.000Z"
    );
    expect(providerPostedDate("recruitee", { published_at: "2026-10-12T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-12T00:00:00.000Z"
    );
    expect(providerPostedDate("bamboohr", { datePosted: "2026-10-09T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-09T00:00:00.000Z"
    );
    expect(providerPostedDate("teamtailor", { pubDate: "2026-10-08T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-08T00:00:00.000Z"
    );
    expect(providerPostedDate("personio", { createdAt: "2026-10-07T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-07T00:00:00.000Z"
    );
    expect(providerPostedDate("rippling", { createdAt: "2026-10-06T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-06T00:00:00.000Z"
    );
    expect(providerPostedDate("jobbank", { datePosted: "2026-10-05T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-05T00:00:00.000Z"
    );
    expect(providerPostedDate("remotive", { publication_date: "2026-10-04T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-04T00:00:00.000Z"
    );
    expect(providerPostedDate("weworkremotely", { pubDate: "2026-10-03T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-03T00:00:00.000Z"
    );
    expect(providerPostedDate("himalayas", { pubDate: "2026-10-02T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-02T00:00:00.000Z"
    );
    expect(providerPostedDate("remoteok", { date: "1760572800" }, NOW)).toBe("2025-10-16T00:00:00.000Z");
    expect(providerPostedDate("adzuna", { created: "2026-10-01T00:00:00.000Z" }, NOW)).toBe(
      "2026-10-01T00:00:00.000Z"
    );
  });
});
