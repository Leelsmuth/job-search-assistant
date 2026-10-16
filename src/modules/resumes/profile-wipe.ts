import { and, eq, inArray } from "drizzle-orm";
import type { ProfileSectionKey } from "@/modules/resumes/review/profile-snapshot";
import { PROFILE_SECTIONS } from "@/modules/resumes/review/profile-snapshot";
import type { Db } from "@/server/actions/helpers";
import {
  candidateProfiles,
  candidateSkills,
  candidateExperiences,
  candidateExperienceBullets,
  candidateProjects,
  candidateEducation,
  candidateCertifications,
  profileEvidence,
  requirementMatches,
  tailoringSuggestions,
} from "@/db/schema";

async function detachProfileEvidenceReferences(db: Db, profileId: string) {
  const evidenceRows = await db.query.profileEvidence.findMany({
    where: eq(profileEvidence.profileId, profileId),
    columns: { id: true },
  });
  const evidenceIds = evidenceRows.map((row) => row.id);
  if (evidenceIds.length === 0) return;

  await db
    .update(requirementMatches)
    .set({ evidenceId: null })
    .where(inArray(requirementMatches.evidenceId, evidenceIds));

  await db
    .update(tailoringSuggestions)
    .set({ evidenceId: null })
    .where(inArray(tailoringSuggestions.evidenceId, evidenceIds));
}

const SECTION_EVIDENCE: Partial<Record<ProfileSectionKey, Array<"resume_bullet" | "experience" | "project" | "education" | "certification" | "summary" | "skill">>> = {
  experience: ["resume_bullet", "experience"],
  projects: ["project"],
  education: ["education"],
  certifications: ["certification"],
  summary: ["summary"],
  skills: ["skill"],
};

function isFullSectionWipe(sections: ProfileSectionKey[]): boolean {
  return PROFILE_SECTIONS.every((section) => sections.includes(section));
}

async function wipeSelectedSections(db: Db, profileId: string, sections: ProfileSectionKey[]) {
  const selected = new Set(sections);

  if (selected.has("skills")) {
    await db.delete(candidateSkills).where(eq(candidateSkills.profileId, profileId));
  }

  const evidenceTypes = sections.flatMap((section) => SECTION_EVIDENCE[section] ?? []);
  if (evidenceTypes.length > 0) {
    const evidenceRows = await db.query.profileEvidence.findMany({
      where: and(
        eq(profileEvidence.profileId, profileId),
        inArray(profileEvidence.sourceType, evidenceTypes)
      ),
      columns: { id: true },
    });
    const evidenceIds = evidenceRows.map((row) => row.id);
    if (evidenceIds.length > 0) {
      await db
        .update(requirementMatches)
        .set({ evidenceId: null })
        .where(inArray(requirementMatches.evidenceId, evidenceIds));
      await db
        .update(tailoringSuggestions)
        .set({ evidenceId: null })
        .where(inArray(tailoringSuggestions.evidenceId, evidenceIds));
      await db.delete(profileEvidence).where(inArray(profileEvidence.id, evidenceIds));
    }
  }

  if (selected.has("projects")) {
    await db.delete(candidateProjects).where(eq(candidateProjects.profileId, profileId));
  }
  if (selected.has("education")) {
    await db.delete(candidateEducation).where(eq(candidateEducation.profileId, profileId));
  }
  if (selected.has("certifications")) {
    await db.delete(candidateCertifications).where(eq(candidateCertifications.profileId, profileId));
  }
  if (selected.has("experience")) {
    const experiences = await db.query.candidateExperiences.findMany({
      where: eq(candidateExperiences.profileId, profileId),
    });
    for (const experience of experiences) {
      await db
        .delete(candidateExperienceBullets)
        .where(eq(candidateExperienceBullets.experienceId, experience.id));
    }
    await db.delete(candidateExperiences).where(eq(candidateExperiences.profileId, profileId));
  }
}

export async function wipeExtractedProfileData(
  db: Db,
  profileId: string,
  sections?: ProfileSectionKey[]
) {
  if (sections && !isFullSectionWipe(sections)) {
    await wipeSelectedSections(db, profileId, sections);
    return;
  }

  await db.delete(candidateSkills).where(eq(candidateSkills.profileId, profileId));

  await detachProfileEvidenceReferences(db, profileId);
  await db.delete(profileEvidence).where(eq(profileEvidence.profileId, profileId));
  await db.delete(candidateProjects).where(eq(candidateProjects.profileId, profileId));
  await db.delete(candidateEducation).where(eq(candidateEducation.profileId, profileId));
  await db.delete(candidateCertifications).where(eq(candidateCertifications.profileId, profileId));

  const experiences = await db.query.candidateExperiences.findMany({
    where: eq(candidateExperiences.profileId, profileId),
  });
  for (const exp of experiences) {
    await db
      .delete(candidateExperienceBullets)
      .where(eq(candidateExperienceBullets.experienceId, exp.id));
  }
  await db.delete(candidateExperiences).where(eq(candidateExperiences.profileId, profileId));

  await db
    .update(candidateProfiles)
    .set({ rawResumeText: null, updatedAt: new Date() })
    .where(eq(candidateProfiles.id, profileId));
}
