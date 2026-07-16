import { z } from "zod";
import { newEntityId } from "@/lib/entity-id";
import {
  DATE_RANGE_PATTERN,
  JOB_TITLE_PATTERN,
} from "@/modules/resumes/parse/experience-semantics";
import { reconcileExperienceList } from "@/modules/resumes/parse/experience-reconciliation";

export { newEntityId };

export const PARSED_RESUME_SCHEMA_VERSION = 1 as const;

export const sourceEvidenceSchema = z.object({
  page: z.number().nullable(),
  lineStart: z.number().nullable().optional(),
  lineEnd: z.number().nullable().optional(),
  rawText: z.string(),
  normalizedText: z.string(),
});

export const contactSchema = z.object({
  fullName: z.string().nullable(),
  headline: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedInUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  otherLinks: z
    .array(
      z.object({
        label: z.string().nullable(),
        url: z.string(),
      })
    )
    .default([]),
});

export const skillGroupSchema = z.object({
  category: z.string().nullable(),
  skills: z.array(z.string()),
});

export const experienceSchema = z
  .object({
    id: z.string(),
    company: z.string().nullable(),
    title: z.string().nullable(),
    location: z.string().nullable(),
    employmentType: z.string().nullable(),
    startDateText: z.string().nullable(),
    endDateText: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    isCurrent: z.boolean(),
    achievements: z.array(z.string()),
    technologies: z.array(z.string()),
    sourceEvidence: z.array(sourceEvidenceSchema).default([]),
  })
  .superRefine((experience, ctx) => {
    if (experience.title && DATE_RANGE_PATTERN.test(experience.title)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "Job title appears to contain an employment date range.",
      });
    }

    if (experience.company && DATE_RANGE_PATTERN.test(experience.company)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["company"],
        message: "Company appears to contain an employment date range.",
      });
    }

    if (experience.company && JOB_TITLE_PATTERN.test(experience.company)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["company"],
        message: "Company appears to contain a job title.",
      });
    }
  });

export const educationSchema = z.object({
  id: z.string(),
  institution: z.string().nullable(),
  qualification: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  startDateText: z.string().nullable(),
  endDateText: z.string().nullable(),
  location: z.string().nullable(),
});

export const certificationSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string().nullable(),
  issuedDateText: z.string().nullable(),
  expirationDateText: z.string().nullable(),
  credentialId: z.string().nullable(),
  credentialUrl: z.string().nullable(),
  sourceEvidence: z.array(sourceEvidenceSchema).default([]),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  achievements: z.array(z.string()),
  technologies: z.array(z.string()),
  url: z.string().nullable(),
});

export const additionalSectionSchema = z.object({
  heading: z.string(),
  content: z.array(z.string()),
});

export const unclassifiedLineSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceEvidence: sourceEvidenceSchema.optional(),
});

export const parseWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldPath: z.string().nullable(),
});

export const confidenceScoresSchema = z.object({
  overall: z.number().min(0).max(1),
  contact: z.number().min(0).max(1),
  summary: z.number().min(0).max(1),
  skills: z.number().min(0).max(1),
  experience: z.number().min(0).max(1),
  education: z.number().min(0).max(1),
  certifications: z.number().min(0).max(1),
});

export const parsedResumeSchema = z.object({
  schemaVersion: z.literal(PARSED_RESUME_SCHEMA_VERSION),
  contact: contactSchema,
  professionalSummary: z.string().nullable(),
  skillGroups: z.array(skillGroupSchema),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  certifications: z.array(certificationSchema),
  projects: z.array(projectSchema),
  additionalSections: z.array(additionalSectionSchema),
  unclassified: z.array(unclassifiedLineSchema).default([]),
  warnings: z.array(parseWarningSchema).default([]),
  confidence: confidenceScoresSchema,
});

export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type SkillGroup = z.infer<typeof skillGroupSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Certification = z.infer<typeof certificationSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ParseWarning = z.infer<typeof parseWarningSchema>;
export type ConfidenceScores = z.infer<typeof confidenceScoresSchema>;
export type ParsedResume = z.infer<typeof parsedResumeSchema>;

export function emptyParsedResume(): ParsedResume {
  return {
    schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
    contact: {
      fullName: null,
      headline: null,
      email: null,
      phone: null,
      location: null,
      linkedInUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      otherLinks: [],
    },
    professionalSummary: null,
    skillGroups: [],
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    additionalSections: [],
    unclassified: [],
    warnings: [],
    confidence: {
      overall: 0,
      contact: 0,
      summary: 0,
      skills: 0,
      experience: 0,
      education: 0,
      certifications: 0,
    },
  };
}

export function sanitizeParsedResume(input: ParsedResume): ParsedResume {
  const reconciledExperience = reconcileExperienceList(input.experience);

  return parsedResumeSchema.parse({
    ...input,
    skillGroups: input.skillGroups
      .map((g) => ({
        category: g.category?.trim() || null,
        skills: g.skills.map((s) => s.trim()).filter(Boolean),
      }))
      .filter((g) => g.skills.length > 0),
    experience: reconciledExperience
      .map((exp) => ({
        ...exp,
        company: exp.company?.trim() || null,
        title: exp.title?.trim() || null,
        achievements: exp.achievements.map((a) => a.trim()).filter(Boolean),
        technologies: exp.technologies.map((t) => t.trim()).filter(Boolean),
      }))
      .filter((exp) => exp.company || exp.title || exp.achievements.length > 0),
    education: input.education.filter((e) => e.institution?.trim()),
    certifications: input.certifications.filter((c) => c.name.trim()),
    projects: input.projects.filter((p) => p.name.trim()),
    unclassified: input.unclassified.filter((u) => u.text.trim()),
  });
}
