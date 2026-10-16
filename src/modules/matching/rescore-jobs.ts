import { eq } from "drizzle-orm";
import { candidateProfiles, candidateSkills, jobs, searchPreferences } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import { categoryForCanonicalSkill } from "@/modules/candidate/skill-dictionary";
import { sanitizeSkills, skillsLookCorrupted } from "@/modules/candidate/sanitize-skills";
import { workplaceTypeFromMode, inferWorkMode } from "@/modules/location/eligibility";
import { fitSnapshot, scoreJobFit, type FitProfile } from "@/modules/matching/fit-score";
import { loadSearchPreferences } from "@/modules/matching/load-search-preferences";
import { resolveSharedTargets, sameTitles } from "@/modules/matching/shared-targets";

export type RescoreResult = {
  jobsScored: number;
  skillsBefore: number;
  skillsAfter: number;
  skillsRewritten: boolean;
  targetsSynced: boolean;
};

export async function loadFitProfile(
  db: Db,
  userId: string
): Promise<{ profile: FitProfile; gtaCities: string[] }> {
  const prefs = await loadSearchPreferences(db, userId);
  const profile = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
    columns: {
      targetTitles: true,
      minimumSalary: true,
      yearsExperience: true,
    },
    with: { skills: { columns: { name: true } } },
  });
  const targets = resolveSharedTargets({
    profileTitles: profile?.targetTitles,
    preferenceTitles: prefs.targetTitles,
    profileSalary: profile?.minimumSalary,
    preferenceSalary: prefs.minimumSalaryCad,
  });
  return {
    gtaCities: prefs.gtaCities,
    profile: {
      skills: profile?.skills.map((skill) => skill.name) ?? [],
      yearsExperience: profile?.yearsExperience,
      minimumSalaryCad: targets.minimumSalaryCad,
      targetTitles: targets.targetTitles,
    },
  };
}

async function syncTargets(db: Db, userId: string): Promise<boolean> {
  const prefs = await loadSearchPreferences(db, userId);
  const profile = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
    columns: { id: true, targetTitles: true, minimumSalary: true },
  });
  if (!profile) return false;
  const targets = resolveSharedTargets({
    profileTitles: profile.targetTitles,
    preferenceTitles: prefs.targetTitles,
    profileSalary: profile.minimumSalary,
    preferenceSalary: prefs.minimumSalaryCad,
  });
  const preferenceRow = await db.query.searchPreferences.findFirst({
    where: eq(searchPreferences.userId, userId),
    columns: { userId: true },
  });
  const titlesDiffer =
    !sameTitles(profile.targetTitles, targets.targetTitles) ||
    !sameTitles(prefs.targetTitles, targets.targetTitles);
  const salaryDiffers =
    profile.minimumSalary !== targets.minimumSalaryCad ||
    prefs.minimumSalaryCad !== targets.minimumSalaryCad;
  if (preferenceRow && !titlesDiffer && !salaryDiffers) return false;

  await db
    .update(candidateProfiles)
    .set({
      targetTitles: targets.targetTitles,
      minimumSalary: targets.minimumSalaryCad,
      updatedAt: new Date(),
    })
    .where(eq(candidateProfiles.id, profile.id));

  if (!preferenceRow) {
    await db.insert(searchPreferences).values({
      userId,
      targetTitles: targets.targetTitles,
      preferredSeniority: prefs.preferredSeniority,
      minimumSalaryCad: targets.minimumSalaryCad,
      minFitToShow: prefs.minFitToShow,
      digestMinFit: prefs.digestMinFit,
      includeHybridGta: prefs.includeHybridGta,
      includeOnsiteGta: prefs.includeOnsiteGta,
      showRemoteOther: prefs.showRemoteOther,
      showOutOfArea: prefs.showOutOfArea,
      discoverCuratedBoards: prefs.discoverCuratedBoards,
      excludedCuratedBoardUrls: prefs.excludedCuratedBoardUrls,
      gtaCities: prefs.gtaCities,
      updatedAt: new Date(),
    });
  } else {
    await db
      .update(searchPreferences)
      .set({
        targetTitles: targets.targetTitles,
        minimumSalaryCad: targets.minimumSalaryCad,
        updatedAt: new Date(),
      })
      .where(eq(searchPreferences.userId, userId));
  }
  return true;
}

export async function replaceCandidateSkills(
  db: Db,
  profileId: string,
  names: readonly string[]
): Promise<string[]> {
  const cleaned = sanitizeSkills(names);
  await db.delete(candidateSkills).where(eq(candidateSkills.profileId, profileId));
  if (cleaned.length > 0) {
    await db.insert(candidateSkills).values(
      cleaned.map((name) => ({
        profileId,
        name,
        category: categoryForCanonicalSkill(name),
      }))
    );
  }
  return cleaned;
}

export async function rescoreUserJobs(db: Db, userId: string): Promise<RescoreResult> {
  const profile = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
    columns: { id: true },
    with: { skills: { columns: { name: true } } },
  });
  const currentNames = profile?.skills.map((skill) => skill.name) ?? [];
  let skillsAfter = currentNames.length;
  let skillsRewritten = false;
  if (profile) {
    const cleaned = sanitizeSkills(currentNames);
    const currentSet = new Set(currentNames);
    const cleanedSet = new Set(cleaned);
    const same =
      currentNames.length === cleaned.length &&
      cleaned.every((name) => currentSet.has(name)) &&
      currentNames.every((name) => cleanedSet.has(name));
    if (!same || skillsLookCorrupted(currentNames)) {
      const replaced = await replaceCandidateSkills(db, profile.id, currentNames);
      skillsAfter = replaced.length;
      skillsRewritten = true;
    }
  }

  const targetsSynced = await syncTargets(db, userId);
  const { profile: fitProfile, gtaCities } = await loadFitProfile(db, userId);

  const rows = await db.query.jobs.findMany({
    where: eq(jobs.userId, userId),
    columns: {
      id: true,
      title: true,
      location: true,
      workplaceType: true,
      description: true,
      technologies: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
    },
    with: {
      requirements: {
        columns: { text: true, normalizedSkill: true },
      },
    },
  });

  for (const row of rows) {
    const fit = scoreJobFit(
      {
        title: row.title,
        description: row.description,
        location: row.location,
        workplaceType: row.workplaceType,
        technologies: row.technologies,
        requirements: row.requirements,
        salaryMin: row.salaryMin,
        salaryMax: row.salaryMax,
        salaryCurrency: row.salaryCurrency,
      },
      fitProfile,
      gtaCities
    );
    const snapshot = fitSnapshot(fit);
    const inferred = workplaceTypeFromMode(
      inferWorkMode({
        title: row.title,
        location: row.location,
        workplaceType: row.workplaceType,
        description: row.description,
      })
    );
    const workplaceMissing = !row.workplaceType || row.workplaceType === "unknown";
    await db
      .update(jobs)
      .set({
        ...snapshot,
        ...(workplaceMissing && inferred ? { workplaceType: inferred } : {}),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, row.id));
  }

  return {
    jobsScored: rows.length,
    skillsBefore: currentNames.length,
    skillsAfter,
    skillsRewritten,
    targetsSynced,
  };
}
