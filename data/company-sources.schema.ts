import { z } from "zod";

export const atsProviderSchema = z.enum(["greenhouse", "lever", "ashby"]);

export const verificationStatusSchema = z.enum([
  "verified",
  "empty",
  "invalid",
  "unavailable",
  "rate_limited",
  "verification_failed",
]);

export const observedSignalsSchema = z.object({
  hasCanadaJobs: z.boolean(),
  hasRemoteCanadaJobs: z.boolean(),
  hasFrontendJobs: z.boolean(),
  hasReactJobs: z.boolean(),
  hasTypeScriptJobs: z.boolean(),
  hasRemoteJobs: z.boolean(),
  frontendJobCount: z.number().int().nonnegative(),
  reactJobCount: z.number().int().nonnegative(),
  typescriptJobCount: z.number().int().nonnegative(),
  canadaJobCount: z.number().int().nonnegative(),
  remoteCanadaJobCount: z.number().int().nonnegative(),
  analyzedAt: z.string(),
});

export const companyJobSourceSchema = z.object({
  id: z.string().min(1).max(120),
  companyName: z.string().min(1).max(200),
  companySlug: z.string().min(1).max(200),
  atsProvider: atsProviderSchema,
  boardSlug: z.string().min(1).max(200),
  boardUrl: z.string().url(),
  companyWebsite: z.string().url().optional(),
  careersUrl: z.string().url().optional(),
  headquartersCountry: z.string().max(2).optional(),
  companyCountries: z.array(z.string().max(2)).optional(),
  industries: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  verificationStatus: verificationStatusSchema.default("verification_failed"),
  verifiedAt: z.string().optional(),
  lastJobCount: z.number().int().nonnegative().optional(),
  verificationError: z.string().optional(),
  observedSignals: observedSignalsSchema.optional(),
  discoverySource: z.string().optional(),
  lastSyncedAt: z.string().optional(),
});

export const companySourcesSeedSchema = z.object({
  version: z.number().int().default(2),
  updatedAt: z.string().optional(),
  companies: z.array(companyJobSourceSchema),
});

export type AtsProvider = z.infer<typeof atsProviderSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type ObservedSignals = z.infer<typeof observedSignalsSchema>;
export type CompanyJobSource = z.infer<typeof companyJobSourceSchema>;
export type CompanySourcesSeed = z.infer<typeof companySourcesSeedSchema>;

export const SEED_FILE_PATH = "data/company-sources.seed.json";

/** @deprecated Use industries + observedSignals instead */
export const LEGACY_CANDIDATE_TAGS = new Set([
  "remote-canada",
  "frontend-heavy",
  "remote-friendly",
]);
