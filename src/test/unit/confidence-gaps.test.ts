import { describe, expect, it } from "vitest";
import { computeConfidenceScores, experienceGapWarnings } from "@/modules/resumes/parse/confidence";
import { emptyParsedResume } from "@/modules/resumes/schema/resume-schema";

describe("experience confidence gaps", () => {
  it("caps experience confidence and warns when a role lacks a title or company", () => {
    const resume = emptyParsedResume();
    resume.experience = [
      {
        id: "role-1",
        company: "Northwind Labs",
        title: null,
        location: null,
        employmentType: null,
        startDateText: "2022-06",
        endDateText: null,
        startDate: "2022-06",
        endDate: null,
        isCurrent: true,
        achievements: ["Shipped the billing workspace for the platform team."],
        technologies: [],
        sourceEvidence: [],
      },
      {
        id: "role-2",
        company: null,
        title: "Software Developer",
        location: null,
        employmentType: null,
        startDateText: "2019-08",
        endDateText: "2020-12",
        startDate: "2019-08",
        endDate: "2020-12",
        isCurrent: false,
        achievements: ["Maintained the admin console for support staff."],
        technologies: [],
        sourceEvidence: [],
      },
    ];

    const warnings = experienceGapWarnings(resume);
    expect(warnings.map((warning) => warning.code)).toEqual(["missing_title", "missing_company"]);
    expect(warnings[0].fieldPath).toBe("experience.0.title");
    expect(warnings[1].fieldPath).toBe("experience.1.company");
    expect(computeConfidenceScores(resume, warnings).experience).toBeLessThanOrEqual(0.4);
  });
});
