import { z } from "zod";

export const atsProviderSchema = z.enum(["greenhouse", "lever", "ashby"]);

export const companyCountrySchema = z.enum(["CA", "US", "GLOBAL"]);

export const companyJobSourceSchema = z.object({
  id: z.string().min(1).max(100),
  companyName: z.string().min(1).max(200),
  atsProvider: atsProviderSchema,
  boardUrl: z.string().url(),
  boardSlug: z.string().min(1).max(200),
  careersUrl: z.string().url().optional(),
  companyWebsite: z.string().url().optional(),
  country: companyCountrySchema,
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  verifiedAt: z.string().optional(),
  lastJobCount: z.number().int().nonnegative().optional(),
  lastVerifyError: z.string().optional(),
});

export const companySourcesSeedSchema = z.object({
  version: z.number().int().default(1),
  updatedAt: z.string().optional(),
  companies: z.array(companyJobSourceSchema),
});

export type CompanyJobSource = z.infer<typeof companyJobSourceSchema>;
export type CompanySourcesSeed = z.infer<typeof companySourcesSeedSchema>;

export const SEED_FILE_PATH = "data/company-sources.seed.json";
