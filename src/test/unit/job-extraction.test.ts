import { describe, it, expect } from "vitest";
import { loadJobPostFixtures } from "@/db/seed-data";
import {
  extractRequirementsFromText,
  requirementsToStructured,
  extractTechnologies,
} from "@/modules/ingestion/extract-requirements";
import { normalizedJobSchema } from "@/modules/ingestion/types";

describe("job requirement extraction spike", () => {
  const fixtures = loadJobPostFixtures();

  it("loads 10 job post fixtures", () => {
    expect(fixtures.length).toBe(10);
  });

  fixtures.forEach((fixture) => {
    it(`extracts requirements for ${fixture.id}`, () => {
      const description = [
        fixture.description,
        ...(fixture.requiredQualifications ?? []).map((q: string) => `Required: ${q}`),
        ...(fixture.preferredQualifications ?? []).map((q: string) => `Preferred: ${q}`),
        ...(fixture.responsibilities ?? []).map((r: string) => `Responsibility: ${r}`),
      ].join("\n");

      const extracted = extractRequirementsFromText(description);
      const normalized = normalizedJobSchema.parse({
        company: fixture.company,
        title: fixture.title,
        location: fixture.location,
        workplaceType: fixture.workplaceType,
        description,
        requiredQualifications: fixture.requiredQualifications ?? extracted.required,
        preferredQualifications: fixture.preferredQualifications ?? extracted.preferred,
        responsibilities: fixture.responsibilities ?? extracted.responsibilities,
        technologies: fixture.technologies ?? extracted.technologies,
      });

      const structured = requirementsToStructured(normalized);
      expect(structured.length).toBeGreaterThan(0);

      if (fixture.technologies?.length) {
        const techs = extractTechnologies(description);
        expect(techs.length).toBeGreaterThan(0);
      }
    });
  });

  it("identifies Java/K8s/AWS in fullstack fixture", () => {
    const fixture = fixtures.find((f) => f.id === "fullstack-java-kubernetes");
    const description = [
      ...(fixture?.requiredQualifications ?? []),
      ...(fixture?.technologies ?? []),
    ].join(" ");
    const techs = extractTechnologies(description);
    expect(techs).toContain("java");
    expect(techs).toContain("kubernetes");
    expect(techs).toContain("aws");
  });
});
