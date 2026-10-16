import { describe, expect, it } from "vitest";
import { nonEngineeringReason, scoreJobFit } from "@/modules/matching/fit-score";
import { classifyLocationEligibility } from "@/modules/location/eligibility";

describe("job fit gates", () => {
  it("flags non-engineering titles and leaves design engineering eligible", () => {
    expect(nonEngineeringReason("Product Manager")).toMatch(/product management/i);
    expect(nonEngineeringReason("UX Designer")).toMatch(/design/i);
    expect(nonEngineeringReason("Data Architect")).toMatch(/data/i);
    expect(nonEngineeringReason("Business Analyst")).toMatch(/analysis/i);
    expect(nonEngineeringReason("Security Engineer")).toMatch(/security/i);
    expect(nonEngineeringReason("Account Executive")).toMatch(/sales/i);
    expect(nonEngineeringReason("Customer Experience Lead")).toMatch(/customer experience/i);
    expect(nonEngineeringReason("Design Engineer")).toBeNull();
    expect(nonEngineeringReason("Senior Frontend Engineer")).toBeNull();
    expect(nonEngineeringReason("SDET")).toBeNull();
  });

  it("reads remote Canada from the title when workplace and location are empty", () => {
    const result = classifyLocationEligibility({
      title: "Senior Staff SWE, Frontend (Web Infra) - Remote Canada",
      location: null,
      workplaceType: null,
      description: "Join the web infrastructure team.",
    });
    expect(result.class).toBe("remote_canada");
  });

  it("treats a United States remote design role as ineligible", () => {
    const fit = scoreJobFit(
      {
        title: "Design Engineer, United States",
        location: "United States",
        workplaceType: "remote",
        description: "US only.",
      },
      { yearsExperience: 6, skills: ["React", "TypeScript"] }
    );
    expect(fit.eligible).toBe(false);
    expect(fit.location.class).toBe("remote_other");
  });

  it("keeps Toronto hybrid and remote Canada eligible", () => {
    expect(
      scoreJobFit(
        {
          title: "Senior Frontend Engineer",
          location: "Toronto, ON",
          workplaceType: "hybrid",
          description: "Three days in Toronto.",
        },
        { yearsExperience: 6, skills: ["React"] }
      ).eligible
    ).toBe(true);
    expect(
      scoreJobFit(
        {
          title: "Frontend Engineer",
          location: "Remote - Canada",
          workplaceType: "remote",
          description: "Work from Canada.",
        },
        { yearsExperience: 6, skills: ["React"] }
      ).eligible
    ).toBe(true);
  });
});
