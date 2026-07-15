import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { previewJobImport, requirementsToStructured } from "@/modules/ingestion";
import { runMatchAnalysis, type CandidateProfile } from "@/modules/matching/engine";

function loadSeedProfile(): CandidateProfile {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "src/test/fixtures/seed-profile.json"), "utf-8")
  );

  const evidence = raw.experiences.flatMap(
    (
      exp: { bullets: string[] },
      expIdx: number
    ) =>
      exp.bullets.map((bullet: string, bulletIdx: number) => ({
        id: `exp-${expIdx}-bullet-${bulletIdx}`,
        evidenceText: bullet,
        normalizedSkills: bullet.toLowerCase().includes("react")
          ? ["react", "typescript"]
          : ["typescript"],
      }))
  );

  return {
    location: raw.location,
    workAuthorization: raw.workAuthorization,
    targetTitles: raw.targetTitles,
    preferredSeniority: raw.preferredSeniority,
    remotePreference: raw.remotePreference,
    preferredLocations: raw.preferredLocations,
    yearsExperience: raw.yearsExperience,
    skills: raw.skills,
    evidence,
  };
}

describe("import → match integration", () => {
  it("imports pasted job description and produces match analysis", async () => {
    const fixture = JSON.parse(
      readFileSync(
        join(process.cwd(), "src/test/fixtures/job-posts/01-senior-frontend-react.json"),
        "utf-8"
      )
    );

    const pasted = [
      `Title: ${fixture.title}`,
      `Company: ${fixture.company}`,
      `Location: ${fixture.location}`,
      fixture.description,
      ...(fixture.requiredQualifications ?? []).map((q: string) => `Required: ${q}`),
      ...(fixture.technologies ?? []).map((t: string) => t),
    ].join("\n");

    const { normalized } = await previewJobImport(pasted);
    expect(normalized.title).toBeTruthy();
    expect(normalized.company).toBeTruthy();

    const structuredReqs = requirementsToStructured(normalized);
    expect(structuredReqs.length).toBeGreaterThan(0);

    const profile = loadSeedProfile();
    const analysis = runMatchAnalysis(profile, {
      title: normalized.title,
      location: normalized.location,
      workplaceType: normalized.workplaceType,
      description: normalized.description,
      requirements: structuredReqs.map((req, i) => ({
        id: `req-${i}`,
        requirementType: req.requirementType,
        text: req.text,
        normalizedSkill: req.normalizedSkill,
        importance: req.importance,
        isHardRequirement: req.isHardRequirement,
      })),
    });

    expect(analysis.overallScore).toBeGreaterThan(45);
    expect(["excellent", "strong", "possible", "stretch"]).toContain(analysis.classification);
    expect(analysis.requirementMatches.length).toBeGreaterThan(0);

    const reactMatch = analysis.requirementMatches.find((m) =>
      m.explanation.toLowerCase().includes("react")
    );
    expect(reactMatch?.matchStatus).toBe("confirmed");
  });

  it("classifies Java/K8s role as poor match for React profile", async () => {
    const fixture = JSON.parse(
      readFileSync(
        join(process.cwd(), "src/test/fixtures/job-posts/02-fullstack-java-k8s.json"),
        "utf-8"
      )
    );

    const pasted = [
      `Title: ${fixture.title}`,
      `Company: ${fixture.company}`,
      fixture.description,
      ...(fixture.requiredQualifications ?? []).join("\n"),
    ].join("\n");

    const { normalized } = await previewJobImport(pasted);
    const structuredReqs = requirementsToStructured(normalized);
    const profile = loadSeedProfile();

    const analysis = runMatchAnalysis(profile, {
      title: normalized.title,
      location: normalized.location,
      workplaceType: normalized.workplaceType,
      description: normalized.description,
      requirements: structuredReqs.map((req, i) => ({
        id: `req-${i}`,
        requirementType: req.requirementType,
        text: req.text,
        normalizedSkill: req.normalizedSkill,
        importance: req.importance,
        isHardRequirement: req.isHardRequirement,
      })),
    });

    expect(["poor", "stretch"]).toContain(analysis.classification);
  });
});
