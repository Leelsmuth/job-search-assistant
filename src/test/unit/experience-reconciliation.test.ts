import { describe, it, expect } from "vitest";
import {
  looksLikeDateRange,
  looksLikeJobTitle,
  looksLikeCompanyName,
} from "@/modules/resumes/parse/experience-semantics";
import {
  normalizeExperienceDates,
  parseMonthYearToken,
} from "@/modules/resumes/parse/experience-date-normalizer";
import {
  reconcileExperience,
  mergeExperienceFragments,
} from "@/modules/resumes/parse/experience-reconciliation";
import type { Experience } from "@/modules/resumes/schema/resume-schema";

function exp(partial: Partial<Experience>): Experience {
  return {
    id: "test-id",
    company: null,
    title: null,
    location: null,
    employmentType: null,
    startDateText: null,
    endDateText: null,
    startDate: null,
    endDate: null,
    isCurrent: false,
    achievements: [],
    technologies: [],
    sourceEvidence: [],
    ...partial,
  };
}

describe("experience-semantics", () => {
  it("classifies date ranges, titles, and companies", () => {
    expect(looksLikeDateRange("Jun 2022 – Present")).toBe(true);
    expect(looksLikeDateRange("Oct 2021 - Jun 2022")).toBe(true);
    expect(looksLikeJobTitle("Software Developer")).toBe(true);
    expect(looksLikeJobTitle("Full Stack Developer")).toBe(true);
    expect(looksLikeCompanyName("Priceline")).toBe(true);
    expect(looksLikeCompanyName("Software Developer")).toBe(false);
  });
});

describe("experience-date-normalizer", () => {
  it("normalizes month-year tokens", () => {
    expect(parseMonthYearToken("Jun 2022")).toBe("2022-06");
    expect(parseMonthYearToken("Nov 2020")).toBe("2020-11");
  });

  it("splits date ranges into structured fields", () => {
    const present = normalizeExperienceDates({ dateRange: "Jun 2022 – Present" });
    expect(present.startDateText).toBe("Jun 2022");
    expect(present.endDateText).toBe("Present");
    expect(present.startDate).toBe("2022-06");
    expect(present.isCurrent).toBe(true);

    const bounded = normalizeExperienceDates({ dateRange: "Oct 2021 – Jun 2022" });
    expect(bounded.startDate).toBe("2021-10");
    expect(bounded.endDate).toBe("2022-06");
    expect(bounded.isCurrent).toBe(false);
  });
});

describe("experience-reconciliation", () => {
  it("swaps date-in-title and title-in-company fields", () => {
    const fixed = reconcileExperience(
      exp({
        title: "Jun 2022 – Present",
        company: "Software Developer",
      })
    );

    expect(fixed.title).toBe("Software Developer");
    expect(fixed.company).toBeNull();
    expect(fixed.startDate).toBe("2022-06");
    expect(fixed.isCurrent).toBe(true);
  });

  it("merges adjacent fragment records", () => {
    const merged = mergeExperienceFragments([
      exp({
        title: "Jun 2022 – Present",
        company: "Software Developer",
        achievements: [],
      }),
      exp({
        title: "Priceline",
        achievements: ["Architected Okta migration."],
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].company).toBe("Priceline");
    expect(merged[0].title).toBe("Software Developer");
    expect(merged[0].startDate).toBe("2022-06");
    expect(merged[0].achievements).toHaveLength(1);
  });
});
