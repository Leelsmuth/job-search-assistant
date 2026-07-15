import { describe, it, expect } from "vitest";
import {
  extractRequirementsFromText,
  computeExtractionQuality,
  requirementsToStructured,
} from "@/modules/ingestion/extract-requirements";

describe("extractRequirementsFromText sections", () => {
  it("parses You'll do and You have sections", () => {
    const text = `
What you'll do
- Build React features for the design system
- Collaborate with product and design

What you have
- 5+ years of frontend experience
- Strong TypeScript skills

Bonus
- GraphQL experience
`;
    const result = extractRequirementsFromText(text);
    expect(result.responsibilities.some((r) => /React features/i.test(r))).toBe(true);
    expect(result.required.some((r) => /years/i.test(r))).toBe(true);
    expect(result.preferred.some((r) => /GraphQL/i.test(r))).toBe(true);
  });

  it("classifies authorization and education requirements", () => {
    const structured = requirementsToStructured({
      description: "Must be authorized to work in Canada.",
      educationRequirements: "Bachelor's degree in Computer Science required",
      requiredQualifications: [],
      preferredQualifications: [],
      responsibilities: [],
      technologies: [],
    });
    expect(structured.some((r) => r.requirementType === "authorization")).toBe(true);
    expect(structured.some((r) => r.requirementType === "education")).toBe(true);
  });

  it("computes extraction quality confidence", () => {
    const low = computeExtractionQuality([
      { requirementType: "skill", normalizedSkill: "react" },
    ]);
    expect(low.confidence).toBe("low");

    const high = computeExtractionQuality([
      { requirementType: "skill", normalizedSkill: "react" },
      { requirementType: "skill", normalizedSkill: "typescript" },
      { requirementType: "experience" },
      { requirementType: "responsibility" },
      { requirementType: "location" },
      { requirementType: "skill", normalizedSkill: "graphql" },
    ]);
    expect(high.confidence).toBe("high");
  });
});
