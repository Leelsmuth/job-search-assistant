import { z } from "zod";

export const normalizedJobSchema = z.object({
  company: z.string().min(1).max(200),
  title: z.string().min(1).max(120),
  location: z.string().max(200).optional(),
  workplaceType: z.enum(["remote", "hybrid", "on_site", "unknown"]).optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().default("CAD"),
  jobUrl: z.string().url().optional().or(z.literal("")),
  sourceJobId: z.string().max(200).optional(),
  datePosted: z.string().max(50).optional(),
  employmentType: z.string().max(100).optional(),
  description: z.string().min(1),
  responsibilities: z.array(z.string()).default([]),
  requiredQualifications: z.array(z.string()).default([]),
  preferredQualifications: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  experienceRequirements: z.string().max(2000).optional(),
  educationRequirements: z.string().max(2000).optional(),
});

export type NormalizedJob = z.infer<typeof normalizedJobSchema>;

export const confirmJobImportSchema = normalizedJobSchema.extend({
  description: z.string().min(1).max(50_000),
  responsibilities: z.array(z.string().max(2_000)).max(100),
  requiredQualifications: z.array(z.string().max(2_000)).max(100),
  preferredQualifications: z.array(z.string().max(2_000)).max(100),
  technologies: z.array(z.string().max(100)).max(50),
});

export const jobImportMetaSchema = z.object({
  provider: z.enum([
    "manual",
    "pasted_description",
    "greenhouse",
    "lever",
    "ashby",
    "generic_web",
  ]),
  sourceUrl: z.string().url().optional(),
  sourceJobId: z.string().max(200).optional(),
  boardUrl: z.string().url().optional(),
  rawPayload: z.unknown().optional(),
});

export const MAX_RAW_PAYLOAD_BYTES = 100_000;

export const jobRequirementSchema = z.object({
  requirementType: z.enum([
    "skill",
    "experience",
    "location",
    "authorization",
    "seniority",
    "education",
    "language",
    "clearance",
    "responsibility",
    "domain",
  ]),
  text: z.string(),
  normalizedSkill: z.string().optional(),
  importance: z.enum(["required", "preferred"]).default("required"),
  isHardRequirement: z.boolean().default(false),
});

export const jobRequirementsExtractionSchema = z.object({
  requirements: z.array(jobRequirementSchema),
});

export type JobRequirement = z.infer<typeof jobRequirementSchema>;

export type JobSourceProvider =
  | "manual"
  | "pasted_description"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "generic_web";

export type RawJobSource = {
  provider: JobSourceProvider;
  sourceUrl?: string;
  sourceJobId?: string;
  rawText: string;
  rawPayload?: unknown;
};

export type JobSourceAdapter = {
  provider: JobSourceProvider;
  detect(input: string): Promise<{ confidence: number; reason: string }>;
  fetch(input: string): Promise<RawJobSource>;
  normalize(raw: RawJobSource): Promise<NormalizedJob>;
};
