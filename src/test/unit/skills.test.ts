import { describe, it, expect } from "vitest";
import { extractEvidenceSkills, normalizeSkillCategory } from "@/modules/candidate/skills";

describe("candidate skills helpers", () => {
  it("extracts technologies from bullet text", () => {
    const skills = extractEvidenceSkills(
      "Migrated complex workflows from Ember to React and TypeScript with Playwright tests."
    );
    expect(skills).toContain("react");
    expect(skills).toContain("typescript");
    expect(skills).toContain("playwright");
  });

  it("normalizes skill categories from extraction schema", () => {
    expect(normalizeSkillCategory("frameworks", "React")).toBe("framework");
    expect(normalizeSkillCategory(undefined, "TypeScript")).toBe("language");
    expect(normalizeSkillCategory("unknown", "FooBar")).toBe("domain");
  });
});
