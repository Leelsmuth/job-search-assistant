import { scoreJobFit, type FitJob, type FitProfile, type JobFitResult } from "@/modules/matching/fit-score";

export const FRONTEND_FIT_WEIGHTS = {
  title: 40,
  skills: 35,
  seniority: 15,
  compensation: 8,
} as const;

const SENIORITY_LEVELS = ["intern", "junior", "mid", "senior", "staff"] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

export type FrontendFitJob = FitJob;

export type FrontendFitProfile = FitProfile & {
  preferredSeniority?: string | null;
};

export type FrontendFitResult = {
  score: number;
  reasons: string[];
  breakdown: {
    title: number;
    skills: number;
    seniority: number;
    compensation: number;
  };
  skillHits: string[];
  eligible: boolean;
  ineligibleReason: string | null;
  fit: JobFitResult;
};

export function normalizeSeniority(value: string | null | undefined): SeniorityLevel {
  const text = (value ?? "").toLowerCase();
  if (/\b(intern|internship|co-op|new grad)\b/.test(text)) return "intern";
  if (/\b(junior|jr\.?)\b/.test(text)) return "junior";
  if (/\b(staff|principal|distinguished)\b/.test(text)) return "staff";
  if (/\b(senior|sr\.?|lead)\b/.test(text)) return "senior";
  if (/\bmid(?:-level)?\b|\bintermediate\b/.test(text)) return "mid";
  if (SENIORITY_LEVELS.includes(text as SeniorityLevel)) return text as SeniorityLevel;
  return "senior";
}

/** Unified fit score. Kept under this name so existing callers share one implementation. */
export function scoreFrontendFit(
  job: FrontendFitJob,
  profile: FrontendFitProfile = {},
  gtaCities?: string[]
): FrontendFitResult {
  const fit = scoreJobFit(job, profile, gtaCities);
  return {
    score: fit.score,
    reasons: fit.reasons,
    breakdown: {
      title: fit.breakdown.role.score,
      skills: fit.breakdown.stack.score,
      seniority: fit.breakdown.seniority.score,
      compensation: fit.breakdown.pay.score,
    },
    skillHits: fit.skillHits,
    eligible: fit.eligible,
    ineligibleReason: fit.ineligibleReason,
    fit,
  };
}
