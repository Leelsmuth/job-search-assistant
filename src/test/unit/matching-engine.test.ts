import { describe, it, expect } from "vitest";
import {
  classifyScore,
  applyHardFilters,
  CATEGORY_WEIGHTS,
  runMatchAnalysis,
  isSparseExtraction,
  SPARSE_EXTRACTION_SCORE_CAP,
} from "@/modules/matching/engine";
import type { CandidateProfile, JobForMatching } from "@/modules/matching/engine";

describe("matching engine unit tests", () => {
  const baseProfile: CandidateProfile = {
    location: "Canada",
    remotePreference: "remote",
    preferredLocations: ["Canada", "Remote"],
    yearsExperience: 7,
    skills: [
      { name: "React", category: "framework" },
      { name: "TypeScript", category: "language" },
    ],
    evidence: [],
  };

  it("classifies scores at boundaries", () => {
    expect(classifyScore(90, { result: "pass", warnings: [], blocks: [] })).toBe("excellent");
    expect(classifyScore(80, { result: "pass", warnings: [], blocks: [] })).toBe("strong");
    expect(classifyScore(65, { result: "pass", warnings: [], blocks: [] })).toBe("possible");
    expect(classifyScore(50, { result: "pass", warnings: [], blocks: [] })).toBe("stretch");
    expect(classifyScore(30, { result: "pass", warnings: [], blocks: [] })).toBe("poor");
  });

  it("forces poor on hard block", () => {
    expect(
      classifyScore(95, { result: "block", warnings: [], blocks: ["Location"] })
    ).toBe("poor");
  });

  it("blocks on-site role for remote preference", () => {
    const job: JobForMatching = {
      title: "Engineer",
      location: "San Francisco",
      workplaceType: "on_site",
      requirements: [],
    };
    const result = applyHardFilters(baseProfile, job);
    expect(result.result).toBe("block");
  });

  it("category weights sum to 100", () => {
    const total = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("scores zero for empty core/framework/responsibility categories", () => {
    const profile: CandidateProfile = {
      skills: [{ name: "React", category: "framework" }],
      evidence: [],
    };
    const job: JobForMatching = {
      title: "Engineer",
      requirements: [
        { id: "r1", requirementType: "skill", text: "Go", normalizedSkill: "go", importance: "required", isHardRequirement: false },
      ],
    };
    const result = runMatchAnalysis(profile, job);
    const core = result.categoryScores.find((c) => c.category === "core_skills");
    const fw = result.categoryScores.find((c) => c.category === "frameworks_tools");
    const resp = result.categoryScores.find((c) => c.category === "responsibility_alignment");
    expect(core?.score).toBe(0);
    expect(fw?.score).toBe(0);
    expect(resp?.score).toBe(0);
  });

  it("caps score and warns on sparse extraction", () => {
    const profile: CandidateProfile = {
      skills: [
        { name: "React", category: "framework" },
        { name: "TypeScript", category: "language" },
      ],
      evidence: [{ id: "e1", evidenceText: "Built React apps", normalizedSkills: ["react"] }],
    };
    const job: JobForMatching = {
      title: "Senior React Engineer",
      workplaceType: "remote",
      requirements: [
        { id: "r1", requirementType: "skill", text: "React", normalizedSkill: "react", importance: "required", isHardRequirement: false },
      ],
    };
    expect(isSparseExtraction(job.requirements)).toBe(true);
    const result = runMatchAnalysis(profile, job);
    expect(result.overallScore).toBeLessThanOrEqual(SPARSE_EXTRACTION_SCORE_CAP);
    expect(result.summary).toContain("Limited requirement extraction");
  });

  it("skips education score when job has no education requirements", () => {
    const profile: CandidateProfile = { skills: [], evidence: [] };
    const job: JobForMatching = {
      title: "Engineer",
      description: "Build products.",
      requirements: [],
    };
    const result = runMatchAnalysis(profile, job);
    const edu = result.categoryScores.find((c) => c.category === "education_domain");
    expect(edu?.score).toBe(0);
    expect(edu?.explanation).toContain("No education requirements");
  });
});
