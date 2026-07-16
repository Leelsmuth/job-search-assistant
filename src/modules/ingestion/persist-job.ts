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

export type JobImportMeta = {
  provider: string;
  sourceUrl?: string;
  sourceJobId?: string;
  boardUrl?: string;
  rawPayload?: unknown;
};

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
  lookup: { sourceJobId?: string; jobUrl?: string }
) {
  if (lookup.sourceJobId) {
    const bySource = await db.query.jobs.findFirst({
      where: and(eq(jobs.userId, userId), eq(jobs.sourceJobId, lookup.sourceJobId)),
    });
    if (bySource) return bySource;
  }

  if (lookup.jobUrl) {
    return db.query.jobs.findFirst({
      where: and(eq(jobs.userId, userId), eq(jobs.jobUrl, lookup.jobUrl)),
    });
  }

  return null;
}

export async function persistDiscoveredJob(
  db: Db,
  userId: string,
  normalized: NormalizedJob,
  meta: JobImportMeta
): Promise<{ jobId: string; isNew: boolean }> {
  const validatedJob = confirmJobImportSchema.parse(normalized);
  const validatedMeta = jobImportMetaSchema.parse(meta);

  if (
    validatedMeta.rawPayload !== undefined &&
    JSON.stringify(validatedMeta.rawPayload).length > MAX_RAW_PAYLOAD_BYTES
  ) {
    throw new Error("Import payload too large");
  }

  const existing = await findExistingJob(db, userId, {
    sourceJobId: validatedJob.sourceJobId ?? validatedMeta.sourceJobId,
    jobUrl: validatedJob.jobUrl || validatedMeta.sourceUrl,
  });
  if (existing) {
    return { jobId: existing.id, isNew: false };
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
      workplaceType: validatedJob.workplaceType,
      salaryMin: validatedJob.salaryMin,
      salaryMax: validatedJob.salaryMax,
      salaryCurrency: validatedJob.salaryCurrency,
      jobUrl: validatedJob.jobUrl || validatedMeta.sourceUrl,
      sourceJobId: validatedJob.sourceJobId ?? validatedMeta.sourceJobId,
      employmentType: validatedJob.employmentType,
      description: validatedJob.description,
      responsibilities: validatedJob.responsibilities,
      requiredQualifications: validatedJob.requiredQualifications,
      preferredQualifications: validatedJob.preferredQualifications,
      technologies: validatedJob.technologies,
      experienceRequirements: validatedJob.experienceRequirements,
      educationRequirements: validatedJob.educationRequirements,
      dateDiscovered: new Date(),
      discoveredBoardUrl: validatedMeta.boardUrl,
      descriptionHash: hashJobDescription(validatedJob.description),
    })
    .returning();

  const structuredReqs = requirementsToStructured(validatedJob);
  for (const req of structuredReqs) {
    await db.insert(jobRequirements).values({
      jobId: job.id,
      requirementType: req.requirementType,
      text: req.text,
      normalizedSkill: req.normalizedSkill,
      importance: req.importance,
      isHardRequirement: req.isHardRequirement,
    });
  }

  return { jobId: job.id, isNew: true };
}
