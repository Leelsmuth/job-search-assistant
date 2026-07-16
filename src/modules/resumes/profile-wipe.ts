import { eq, inArray } from "drizzle-orm";
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

export async function wipeExtractedProfileData(db: Db, profileId: string) {
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
