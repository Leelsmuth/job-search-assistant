import { and, eq } from "drizzle-orm";
import {
  candidateProfiles,
  jobs,
  matchAnalyses,
  matchCategoryScores,
  requirementMatches,
} from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import { runMatchAnalysis, type CandidateProfile } from "@/modules/matching/engine";
import { MATCH_ANALYSIS_VERSION } from "@/modules/matching/stale";

async function getOrCreateProfileDb(db: Db, userId: string) {
  const existing = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
    with: { skills: true, evidence: true },
  });
  if (existing) return existing;

  const [profile] = await db
    .insert(candidateProfiles)
    .values({ userId })
    .returning();
  return { ...profile, skills: [], evidence: [] };
}

async function buildCandidateProfileForMatching(
  db: Db,
  profileId: string
): Promise<CandidateProfile> {
  const profile = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.id, profileId),
    with: { skills: true, evidence: true },
  });
  if (!profile) throw new Error("Profile not found");

  return {
    location: profile.location,
    workAuthorization: profile.workAuthorization,
    targetTitles: (profile.targetTitles as string[]) ?? [],
    preferredSeniority: profile.preferredSeniority,
    remotePreference: profile.remotePreference,
    preferredLocations: (profile.preferredLocations as string[]) ?? [],
    yearsExperience: profile.yearsExperience,
    skills: profile.skills.map((s) => ({
      name: s.name,
      category: s.category,
      proficiency: s.proficiency,
      yearsExperience: s.yearsExperience,
    })),
    evidence: profile.evidence.map((e) => ({
      id: e.id,
      evidenceText: e.evidenceText,
      normalizedSkills: (e.normalizedSkills as string[]) ?? [],
    })),
  };
}

export async function runAndSaveMatchAnalysisDb(
  db: Db,
  userId: string,
  jobId: string,
  reqs?: Array<{
    id: string;
    requirementType: string;
    text: string;
    normalizedSkill: string | null;
    importance: string | null;
    isHardRequirement: boolean | null;
  }>
) {
  const profile = await getOrCreateProfileDb(db, userId);

  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.userId, userId)),
    with: { requirements: true },
  });
  if (!job) throw new Error("Job not found");

  const requirements = reqs ?? job.requirements;
  const candidateProfile = await buildCandidateProfileForMatching(db, profile.id);

  const result = runMatchAnalysis(candidateProfile, {
    title: job.title,
    location: job.location,
    workplaceType: job.workplaceType,
    description: job.description,
    requirements: requirements.map((r) => ({
      id: r.id,
      requirementType: r.requirementType,
      text: r.text,
      normalizedSkill: r.normalizedSkill,
      importance: r.importance ?? "required",
      isHardRequirement: r.isHardRequirement ?? false,
    })),
  });

  const [analysis] = await db
    .insert(matchAnalyses)
    .values({
      jobId: job.id,
      profileId: profile.id,
      analysisVersion: MATCH_ANALYSIS_VERSION,
      overallScore: result.overallScore,
      classification: result.classification,
      hardFilterResult: result.hardFilter,
      summary: result.summary,
      topMatchingSkills: result.topMatchingSkills,
      topConcern: result.topConcern,
    })
    .returning();

  for (const cs of result.categoryScores) {
    await db.insert(matchCategoryScores).values({
      matchAnalysisId: analysis.id,
      category: cs.category as "core_skills",
      score: cs.score,
      maxScore: cs.maxScore,
      explanation: cs.explanation,
    });
  }

  for (const rm of result.requirementMatches) {
    await db.insert(requirementMatches).values({
      matchAnalysisId: analysis.id,
      jobRequirementId: rm.jobRequirementId,
      matchStatus: rm.matchStatus,
      confidence: rm.confidence,
      evidenceId: rm.evidenceId,
      explanation: rm.explanation,
    });
  }

  return analysis;
}
