import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import seedProfile from "../test/fixtures/seed-profile.json";
import { normalizeSkill } from "../modules/ingestion/extract-requirements";

export { seedProfile };

export function loadJobPostFixtures() {
  const dir = join(process.cwd(), "src/test/fixtures/job-posts");
  const index = JSON.parse(
    readFileSync(join(dir, "index.json"), "utf-8")
  ) as string[];

  return index.map((file) => {
    const data = JSON.parse(readFileSync(join(dir, file), "utf-8"));
    return data;
  });
}

export function seedProfileToCandidateProfile() {
  return {
    location: seedProfile.location,
    workAuthorization: seedProfile.workAuthorization,
    targetTitles: seedProfile.targetTitles,
    preferredSeniority: seedProfile.preferredSeniority,
    remotePreference: seedProfile.remotePreference,
    preferredLocations: seedProfile.preferredLocations,
    yearsExperience: seedProfile.yearsExperience,
    skills: seedProfile.skills.map((s) => ({
      name: s.name,
      category: s.category,
      proficiency: s.proficiency,
      yearsExperience: s.yearsExperience,
    })),
    evidence: seedProfile.evidence.map((e, i) => ({
      id: `evidence-${i}`,
      evidenceText: e.evidenceText,
      normalizedSkills: e.normalizedSkills.map(normalizeSkill),
    })),
  };
}
