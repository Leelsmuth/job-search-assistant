/**
 * Database seed script — run with: pnpm db:seed
 * Requires DATABASE_URL and an existing auth user id passed as SEED_USER_ID
 */
import { getDb } from "./client";
import {
  candidateProfiles,
  candidateSkills,
  candidateExperiences,
  candidateExperienceBullets,
  profileEvidence,
} from "./schema";
import { seedProfile } from "./seed-data";
import { normalizeSkill } from "../modules/ingestion/extract-requirements";

async function seed() {
  const userId = process.env.SEED_USER_ID;
  if (!userId) {
    console.error("Set SEED_USER_ID to a valid auth.users id");
    process.exit(1);
  }

  const db = getDb();

  const [profile] = await db
    .insert(candidateProfiles)
    .values({
      userId,
      displayName: seedProfile.displayName,
      location: seedProfile.location,
      workAuthorization: seedProfile.workAuthorization,
      targetTitles: seedProfile.targetTitles,
      preferredSeniority: seedProfile.preferredSeniority,
      remotePreference: seedProfile.remotePreference,
      preferredLocations: seedProfile.preferredLocations,
      yearsExperience: seedProfile.yearsExperience,
      summary: seedProfile.summary,
      dealBreakers: seedProfile.dealBreakers,
    })
    .returning();

  for (const skill of seedProfile.skills) {
    await db.insert(candidateSkills).values({
      profileId: profile.id,
      name: skill.name,
      category: skill.category as "framework",
      proficiency: skill.proficiency,
      yearsExperience: skill.yearsExperience,
    });
  }

  for (const exp of seedProfile.experiences) {
    const [experience] = await db
      .insert(candidateExperiences)
      .values({
        profileId: profile.id,
        company: exp.company,
        title: exp.title,
        startDate: exp.startDate,
        endDate: exp.endDate ?? undefined,
        location: exp.location,
      })
      .returning();

    for (const bullet of exp.bullets) {
      const [b] = await db
        .insert(candidateExperienceBullets)
        .values({ experienceId: experience.id, text: bullet })
        .returning();

      await db.insert(profileEvidence).values({
        profileId: profile.id,
        sourceType: "resume_bullet",
        sourceId: b.id,
        evidenceText: bullet,
        normalizedSkills: seedProfile.evidence
          .find((e) => e.evidenceText === bullet)
          ?.normalizedSkills.map(normalizeSkill) ?? [],
      });
    }
  }

  console.log(`Seeded profile ${profile.id} for user ${userId}`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
