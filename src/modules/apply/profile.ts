import { z } from "zod";
import type { ApplicationProfile, SavedAnswerInput } from "./types";

export const DEFAULT_WORK_AUTHORIZATION = "Canadian citizen";
export const DEFAULT_EEO = "Prefer not to say";

export function defaultApplicationProfile(): ApplicationProfile {
  return {
    legalName: "",
    email: "",
    phone: "",
    city: "",
    province: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    workAuthorization: DEFAULT_WORK_AUTHORIZATION,
    requiresSponsorship: false,
    willingToRelocate: false,
    earliestStartDate: "",
    salaryExpectationCad: null,
    pronouns: "",
    howDidYouHear: "",
    eeoGender: DEFAULT_EEO,
    eeoRace: DEFAULT_EEO,
    eeoVeteran: DEFAULT_EEO,
    eeoDisability: DEFAULT_EEO,
    savedAnswers: [],
  };
}

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^https?:\/\//i.test(value), "Enter an http(s) URL")
  .optional()
  .default("");

export const applicationProfileSchema = z.object({
  legalName: optionalText(200),
  email: z
    .string()
    .trim()
    .max(320)
    .refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid email")
    .optional()
    .default(""),
  phone: optionalText(40),
  city: optionalText(120),
  province: optionalText(80),
  linkedinUrl: optionalUrl,
  githubUrl: optionalUrl,
  portfolioUrl: optionalUrl,
  workAuthorization: z.string().trim().min(1).max(200).default(DEFAULT_WORK_AUTHORIZATION),
  requiresSponsorship: z.boolean().default(false),
  willingToRelocate: z.boolean().default(false),
  earliestStartDate: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a YYYY-MM-DD date")
    .optional()
    .default(""),
  salaryExpectationCad: z.number().int().min(0).max(2_000_000).nullable().default(null),
  pronouns: optionalText(80),
  howDidYouHear: optionalText(500),
  eeoGender: z.string().trim().min(1).max(200).default(DEFAULT_EEO),
  eeoRace: z.string().trim().min(1).max(200).default(DEFAULT_EEO),
  eeoVeteran: z.string().trim().min(1).max(200).default(DEFAULT_EEO),
  eeoDisability: z.string().trim().min(1).max(200).default(DEFAULT_EEO),
  savedAnswers: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        question: z.string().trim().min(1).max(300),
        answer: z.string().trim().max(4000),
      })
    )
    .max(20)
    .default([]),
});

export function parseApplicationProfile(input: unknown): ApplicationProfile {
  const parsed = applicationProfileSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Application profile is invalid";
    throw new Error(message);
  }
  return parsed.data;
}

export function profileIsReady(profile: ApplicationProfile): boolean {
  return Boolean(profile.legalName.trim() && profile.email.trim());
}

export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

type ApplicationProfileRow = {
  legalName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  workAuthorization: string | null;
  requiresSponsorship: boolean;
  willingToRelocate: boolean;
  earliestStartDate: string | null;
  salaryExpectationCad: number | null;
  pronouns: string | null;
  howDidYouHear: string | null;
  eeoGender: string | null;
  eeoRace: string | null;
  eeoVeteran: string | null;
  eeoDisability: string | null;
  savedAnswers: unknown;
};

export function applicationProfileFromRow(row: ApplicationProfileRow | null | undefined): ApplicationProfile {
  if (!row) return defaultApplicationProfile();
  const saved = Array.isArray(row.savedAnswers) ? row.savedAnswers : [];
  return {
    legalName: row.legalName ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    city: row.city ?? "",
    province: row.province ?? "",
    linkedinUrl: row.linkedinUrl ?? "",
    githubUrl: row.githubUrl ?? "",
    portfolioUrl: row.portfolioUrl ?? "",
    workAuthorization: row.workAuthorization || defaultApplicationProfile().workAuthorization,
    requiresSponsorship: row.requiresSponsorship,
    willingToRelocate: row.willingToRelocate,
    earliestStartDate: row.earliestStartDate ?? "",
    salaryExpectationCad: row.salaryExpectationCad,
    pronouns: row.pronouns ?? "",
    howDidYouHear: row.howDidYouHear ?? "",
    eeoGender: row.eeoGender || DEFAULT_EEO,
    eeoRace: row.eeoRace || DEFAULT_EEO,
    eeoVeteran: row.eeoVeteran || DEFAULT_EEO,
    eeoDisability: row.eeoDisability || DEFAULT_EEO,
    savedAnswers: saved.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as { id?: unknown; question?: unknown; answer?: unknown };
      if (typeof record.id !== "string" || typeof record.question !== "string" || typeof record.answer !== "string") {
        return [];
      }
      return [{ id: record.id, question: record.question, answer: record.answer }];
    }),
  };
}

export function savedAnswersForStorage(answers: SavedAnswerInput[]): SavedAnswerInput[] {
  return answers
    .map((answer) => ({
      id: answer.id.trim(),
      question: answer.question.trim(),
      answer: answer.answer.trim(),
    }))
    .filter((answer) => answer.question && answer.answer);
}
