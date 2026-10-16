import { and, eq } from "drizzle-orm";
import { companies, jobSources, jobs, jobRequirements } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import {
  confirmJobImportSchema,
  jobImportMetaSchema,
  MAX_RAW_PAYLOAD_BYTES,
  type NormalizedJob,
} from "./types";
import { requirementsToStructured } from "./extract-requirements";
import { hashJobDescription } from "./description-hash";
import { clampJobForImport } from "./clamp-import-job";
import { inferWorkMode, workplaceTypeFromMode } from "@/modules/location/eligibility";
import { fitSnapshot, scoreJobFit } from "@/modules/matching/fit-score";
import { loadFitProfile } from "@/modules/matching/rescore-jobs";
import { incomingSourceWins } from "@/modules/discovery/source-catalog";
import { canonicalApplyUrl, jobDedupeKey } from "./job-dedupe";
import { resolveStoredPostedAt } from "./posted-date";

export type JobImportMeta = {
  provider: string;
  sourceUrl?: string;
  sourceJobId?: string;
  boardUrl?: string;
  rawPayload?: unknown;
};

function storedPosting(value: string | undefined, discoveredAt: Date) {
  return resolveStoredPostedAt({ providerDate: value, discoveredAt });
}

async function findOrCreateCompany(db: Db, name: string, atsProvider?: string) {
  const existing = await db.query.companies.findFirst({
    where: eq(companies.name, name),
  });
  if (existing) return existing;

  const [company] = await db
    .insert(companies)
    .values({ name, atsProvider })
    .returning();
  return company;
}

export async function findExistingJob(
  db: Db,
  userId: string,
  lookup: {
    sourceJobId?: string;
    jobUrl?: string;
    canonicalApplyUrl?: string | null;
    dedupeKey?: string | null;
  }
) {
  const withSource = { source: true } as const;

  if (lookup.sourceJobId) {
    const bySource = await db.query.jobs.findFirst({
      where: and(eq(jobs.userId, userId), eq(jobs.sourceJobId, lookup.sourceJobId)),
      with: withSource,
    });
    if (bySource) return bySource;
  }

  if (lookup.jobUrl) {
    const byUrl = await db.query.jobs.findFirst({
      where: and(eq(jobs.userId, userId), eq(jobs.jobUrl, lookup.jobUrl)),
      with: withSource,
    });
    if (byUrl) return byUrl;
  }

  if (lookup.canonicalApplyUrl) {
    const byCanonical = await db.query.jobs.findFirst({
      where: and(eq(jobs.userId, userId), eq(jobs.canonicalApplyUrl, lookup.canonicalApplyUrl)),
      with: withSource,
    });
    if (byCanonical) return byCanonical;
  }

  if (lookup.dedupeKey) {
    return db.query.jobs.findFirst({
      where: and(eq(jobs.userId, userId), eq(jobs.dedupeKey, lookup.dedupeKey)),
      with: withSource,
    });
  }

  return null;
}

export async function persistDiscoveredJob(
  db: Db,
  userId: string,
  normalized: NormalizedJob,
  meta: JobImportMeta
): Promise<{ jobId: string; isNew: boolean; contentUnchanged?: boolean }> {
  const validatedJob = confirmJobImportSchema.parse(clampJobForImport(normalized));
  const validatedMeta = jobImportMetaSchema.parse(meta);

  if (
    validatedMeta.rawPayload !== undefined &&
    JSON.stringify(validatedMeta.rawPayload).length > MAX_RAW_PAYLOAD_BYTES
  ) {
    throw new Error("Import payload too large");
  }

  const applyUrl = canonicalApplyUrl(validatedJob.jobUrl || validatedMeta.sourceUrl);
  const dedupeKey = jobDedupeKey({
    company: validatedJob.company,
    title: validatedJob.title,
    location: validatedJob.location,
    provider: validatedMeta.provider,
    sourceJobId: validatedJob.sourceJobId ?? validatedMeta.sourceJobId,
  });
  const existing = await findExistingJob(db, userId, {
    sourceJobId: validatedJob.sourceJobId ?? validatedMeta.sourceJobId,
    jobUrl: validatedJob.jobUrl || validatedMeta.sourceUrl,
    canonicalApplyUrl: applyUrl,
    dedupeKey,
  });

  const existingProvider = existing?.source?.provider;
  if (existing && incomingSourceWins(existingProvider, validatedMeta.provider)) {
    const nextUrl = validatedJob.jobUrl || validatedMeta.sourceUrl;
    const nextSourceJobId = validatedJob.sourceJobId ?? validatedMeta.sourceJobId;
    await db
      .update(jobs)
      .set({
        jobUrl: nextUrl,
        sourceJobId: nextSourceJobId,
        canonicalApplyUrl: applyUrl,
        dedupeKey,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, existing.id));
    if (existing.sourceId) {
      await db
        .update(jobSources)
        .set({
          provider: validatedMeta.provider,
          sourceUrl: nextUrl,
          sourceJobId: nextSourceJobId,
        })
        .where(eq(jobSources.id, existing.sourceId));
    }
  }

  const nextHash = hashJobDescription(validatedJob.description);
  if (
    existing &&
    existing.descriptionHash === nextHash &&
    existing.fitScore != null &&
    Number.isFinite(existing.fitScore)
  ) {
    return { jobId: existing.id, isNew: false, contentUnchanged: true };
  }

  const discoveredAt = existing?.dateDiscovered ?? new Date();
  const posting = storedPosting(validatedJob.datePosted, discoveredAt);
  const scoring = await loadFitProfile(db, userId);
  const inferredWorkplace = workplaceTypeFromMode(
    inferWorkMode({
      title: validatedJob.title,
      location: validatedJob.location,
      workplaceType: validatedJob.workplaceType,
      description: validatedJob.description,
    })
  );
  const workplaceType =
    !validatedJob.workplaceType || validatedJob.workplaceType === "unknown"
      ? inferredWorkplace ?? validatedJob.workplaceType
      : validatedJob.workplaceType;
  const structuredReqs = requirementsToStructured(validatedJob);
  const fit = scoreJobFit(
    {
      title: validatedJob.title,
      description: validatedJob.description,
      location: validatedJob.location,
      workplaceType,
      technologies: validatedJob.technologies,
      requirements: structuredReqs,
      salaryMin: validatedJob.salaryMin,
      salaryMax: validatedJob.salaryMax,
      salaryCurrency: validatedJob.salaryCurrency,
    },
    scoring.profile,
    scoring.gtaCities
  );
  const scored = fitSnapshot(fit);

  if (existing) {
    if (existing.descriptionHash === nextHash) {
      const postingUpgrade =
        posting.postedAtSource === "provider" && existing.postedAtSource !== "provider"
          ? {
              postedAt: posting.postedAt,
              postedAtSource: posting.postedAtSource,
              datePosted: posting.datePosted,
            }
          : {};
      if (existing.fitScore == null || Object.keys(postingUpgrade).length > 0) {
        await db
          .update(jobs)
          .set({
            ...(existing.fitScore == null ? scored : {}),
            ...(workplaceType && existing.fitScore == null ? { workplaceType } : {}),
            ...postingUpgrade,
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, existing.id));
      }
      return { jobId: existing.id, isNew: false, contentUnchanged: true };
    }

    await db
      .update(jobs)
      .set({
        title: validatedJob.title,
        location: validatedJob.location,
        workplaceType,
        salaryMin: validatedJob.salaryMin,
        salaryMax: validatedJob.salaryMax,
        salaryCurrency: validatedJob.salaryCurrency,
        description: validatedJob.description,
        descriptionHash: nextHash,
        ...(posting.postedAtSource === "provider"
          ? {
              datePosted: posting.datePosted,
              postedAt: posting.postedAt,
              postedAtSource: posting.postedAtSource,
            }
          : existing.postedAt
            ? {}
            : {
                postedAt: existing.dateDiscovered,
                postedAtSource: "first_seen" as const,
              }),
        canonicalApplyUrl: applyUrl,
        dedupeKey,
        matchPipelineStatus: "match_pending",
        ...scored,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, existing.id));

    await db.delete(jobRequirements).where(eq(jobRequirements.jobId, existing.id));
    if (structuredReqs.length > 0) {
      await db.insert(jobRequirements).values(
        structuredReqs.map((req) => ({
          jobId: existing.id,
          requirementType: req.requirementType,
          text: req.text,
          normalizedSkill: req.normalizedSkill,
          importance: req.importance,
          isHardRequirement: req.isHardRequirement,
        }))
      );
    }

    return { jobId: existing.id, isNew: false, contentUnchanged: false };
  }

  const [source] = await db
    .insert(jobSources)
    .values({
      provider: validatedMeta.provider,
      sourceUrl: validatedMeta.sourceUrl,
      sourceJobId: validatedMeta.sourceJobId ?? validatedJob.sourceJobId,
      rawPayload: validatedMeta.rawPayload as Record<string, unknown> | undefined,
    })
    .returning();

  const company = await findOrCreateCompany(
    db,
    validatedJob.company,
    validatedMeta.provider
  );

  const [job] = await db
    .insert(jobs)
    .values({
      userId,
      companyId: company.id,
      sourceId: source.id,
      title: validatedJob.title,
      location: validatedJob.location,
      workplaceType,
      salaryMin: validatedJob.salaryMin,
      salaryMax: validatedJob.salaryMax,
      salaryCurrency: validatedJob.salaryCurrency,
      jobUrl: validatedJob.jobUrl || validatedMeta.sourceUrl,
      canonicalApplyUrl: applyUrl,
      dedupeKey,
      sourceJobId: validatedJob.sourceJobId ?? validatedMeta.sourceJobId,
      employmentType: validatedJob.employmentType,
      description: validatedJob.description,
      responsibilities: validatedJob.responsibilities,
      requiredQualifications: validatedJob.requiredQualifications,
      preferredQualifications: validatedJob.preferredQualifications,
      technologies: validatedJob.technologies,
      experienceRequirements: validatedJob.experienceRequirements,
      educationRequirements: validatedJob.educationRequirements,
      ...(posting.datePosted ? { datePosted: posting.datePosted } : {}),
      postedAt: posting.postedAt,
      postedAtSource: posting.postedAtSource,
      dateDiscovered: discoveredAt,
      discoveredBoardUrl: validatedMeta.boardUrl,
      descriptionHash: nextHash,
      matchPipelineStatus: "match_pending",
      ...scored,
    })
    .returning();

  if (structuredReqs.length > 0) {
    await db.insert(jobRequirements).values(
      structuredReqs.map((req) => ({
        jobId: job.id,
        requirementType: req.requirementType,
        text: req.text,
        normalizedSkill: req.normalizedSkill,
        importance: req.importance,
        isHardRequirement: req.isHardRequirement,
      }))
    );
  }

  return { jobId: job.id, isNew: true };
}
