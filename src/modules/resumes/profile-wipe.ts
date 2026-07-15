import { eq } from "drizzle-orm";
import type { Db } from "@/server/actions/helpers";
import {
  candidateProfiles,
  candidateSkills,
  candidateExperiences,
  candidateExperienceBullets,
  candidateProjects,
  candidateEducation,
  profileEvidence,
} from "@/db/schema";

export async function wipeExtractedProfileData(db: Db, profileId: string) {
  await db.delete(candidateSkills).where(eq(candidateSkills.profileId, profileId));
  await db.delete(profileEvidence).where(eq(profileEvidence.profileId, profileId));
  await db.delete(candidateProjects).where(eq(candidateProjects.profileId, profileId));
  await db.delete(candidateEducation).where(eq(candidateEducation.profileId, profileId));

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
