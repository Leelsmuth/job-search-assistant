import { parseProviderInstant } from "./posted-date";
import { extractRequirementsFromText } from "./extract-requirements";
import { htmlToPlainText, sanitizeJobTitle, decodeHtmlEntities } from "./html-text";
import { normalizedJobSchema, type NormalizedJob } from "./types";
import { withSourceCredit } from "@/modules/discovery/source-catalog";

export type ListingJobInput = {
  company: string;
  title: string;
  location?: string | null;
  workplaceType?: NormalizedJob["workplaceType"];
  description?: string | null;
  jobUrl?: string | null;
  sourceJobId?: string | null;
  datePosted?: string | number | null;
  employmentType?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  provider?: string;
};

function asText(value: string | null | undefined): string {
  const decoded = decodeHtmlEntities(value ?? "");
  if (/<[a-z][\s\S]*>/i.test(decoded)) return htmlToPlainText(decoded);
  return decoded.trim();
}

function workplaceFrom(location: string, explicit?: NormalizedJob["workplaceType"]): NormalizedJob["workplaceType"] {
  if (explicit && explicit !== "unknown") return explicit;
  if (/\bhybrid\b/i.test(location)) return "hybrid";
  if (/\bremote\b|\bworldwide\b|\bwork from anywhere\b/i.test(location)) return "remote";
  if (/\bon-?site\b|\bin[- ]office\b/i.test(location)) return "on_site";
  return explicit ?? "unknown";
}

export function annualSalary(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < 1000 || rounded > 2_000_000) return undefined;
  return rounded;
}

export function listingToNormalizedJob(input: ListingJobInput): NormalizedJob {
  const location = (input.location ?? "").replace(/\s+/g, " ").trim();
  const description = asText(input.description) || `${input.title} at ${input.company}`;
  const credited = input.provider ? withSourceCredit(description, input.provider) : description;
  const reqs = extractRequirementsFromText(credited);
  const salaryMin = annualSalary(input.salaryMin);
  const salaryMax = annualSalary(input.salaryMax);

  return normalizedJobSchema.parse({
    company: sanitizeJobTitle(input.company, "Company"),
    title: sanitizeJobTitle(input.title),
    location: location ? location.slice(0, 200) : undefined,
    workplaceType: workplaceFrom(location, input.workplaceType),
    description: credited,
    responsibilities: reqs.responsibilities,
    requiredQualifications: reqs.required,
    preferredQualifications: reqs.preferred,
    technologies: reqs.technologies,
    jobUrl: input.jobUrl?.trim() || "",
    sourceJobId: input.sourceJobId?.trim().slice(0, 200) || undefined,
    datePosted: parseProviderInstant(input.datePosted),
    employmentType: input.employmentType?.trim().slice(0, 100) || undefined,
    salaryMin,
    salaryMax: salaryMax != null && salaryMin != null && salaryMax < salaryMin ? salaryMin : salaryMax,
    salaryCurrency: (input.salaryCurrency || "CAD").slice(0, 8),
  });
}

export function slugPart(value: string): string {
  const slug = value.trim().replace(/^\/+|\/+$/g, "");
  if (!/^[a-z0-9][a-z0-9_-]{0,80}$/i.test(slug)) {
    throw new Error("Invalid careers board identifier");
  }
  return slug;
}
