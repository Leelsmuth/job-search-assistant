import { describe, it, expect } from "vitest";
import { loadJobPostFixtures, seedProfileToCandidateProfile } from "@/db/seed-data";
import { requirementsToStructured } from "@/modules/ingestion/extract-requirements";
import { runMatchAnalysis } from "@/modules/matching/engine";
import { normalizedJobSchema } from "@/modules/ingestion/types";

describe("evidence mapping spike — gaps must stay gaps", () => {
  const profile = seedProfileToCandidateProfile();
  const fixtures = loadJobPostFixtures();

  function matchFixture(fixture: (typeof fixtures)[0]) {
    const normalized = normalizedJobSchema.parse({
      company: fixture.company,
      title: fixture.title,
      location: fixture.location,
      workplaceType: fixture.workplaceType,
      description: fixture.description,
      requiredQualifications: fixture.requiredQualifications ?? [],
      preferredQualifications: fixture.preferredQualifications ?? [],
      responsibilities: fixture.responsibilities ?? [],
      technologies: fixture.technologies ?? [],
    });

    const structured = requirementsToStructured(normalized);
    const requirements = structured.map((r, i) => ({
      id: `req-${fixture.id}-${i}`,
      requirementType: r.requirementType,
      text: r.text,
      normalizedSkill: r.normalizedSkill ?? null,
      importance: r.importance,
      isHardRequirement: r.isHardRequirement,
    }));

    return runMatchAnalysis(profile, {
      title: normalized.title,
      location: normalized.location,
      workplaceType: normalized.workplaceType,
      description: normalized.description,
      requirements,
    });
  }

  it("confirms Playwright experience — not hallucinated", () => {
    const fixture = fixtures.find((f) => f.id === "senior-frontend-react-remote-canada")!;
    const result = matchFixture(fixture);

    const playwrightMatch = result.requirementMatches.find((m) =>
      m.explanation.toLowerCase().includes("playwright")
    );
    expect(playwrightMatch?.matchStatus).toBe("confirmed");
  });

  it("does NOT confirm Java/K8s/AWS for fullstack Java role", () => {
    const fixture = fixtures.find((f) => f.id === "fullstack-java-kubernetes")!;
    const result = matchFixture(fixture);

    const javaMatches = result.requirementMatches.filter(
      (m) =>
        m.explanation.toLowerCase().includes("java") ||
        m.explanation.toLowerCase().includes("kubernetes") ||
        m.explanation.toLowerCase().includes("aws")
    );

    for (const match of javaMatches) {
      expect(match.matchStatus).not.toBe("confirmed");
      expect(["gap", "missing_evidence", "transferable", "blocked"]).toContain(
        match.matchStatus
      );
    }

    expect(result.classification).toBe("poor");
  });

  it("blocks on-site US role for remote Canada preference", () => {
    const fixture = fixtures.find((f) => f.id === "frontend-mid-react-onsite-us")!;
    const result = matchFixture(fixture);
    expect(result.hardFilter.result).toBe("block");
    expect(result.classification).toBe("poor");
  });

  it("shows AWS as gap or missing_evidence, not confirmed", () => {
    const fixture = fixtures.find((f) => f.id === "senior-frontend-possible-aws-gap")!;
    const result = matchFixture(fixture);

    const awsMatch = result.requirementMatches.find((m) =>
      m.explanation.toLowerCase().includes("aws")
    );
    if (awsMatch) {
      expect(awsMatch.matchStatus).not.toBe("confirmed");
    }
  });

  it("classifies excellent React role highly", () => {
    const fixture = fixtures.find((f) => f.id === "senior-frontend-react-remote-canada")!;
    const result = matchFixture(fixture);
    expect(["excellent", "strong"]).toContain(result.classification);
    expect(result.overallScore).toBeGreaterThan(70);
  });
});
