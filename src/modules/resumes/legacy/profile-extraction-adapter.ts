import type { ProfileExtraction } from "@/modules/ai/client";
import {
  emptyParsedResume,
  newEntityId,
  type ParsedResume,
} from "@/modules/resumes/schema/resume-schema";

/** Temporary bridge from legacy ProfileExtraction to ParsedResume for migration. */
export function profileExtractionToParsedResume(
  legacy: ProfileExtraction
): ParsedResume {
  const parsed = emptyParsedResume();
  parsed.contact.fullName = legacy.displayName ?? null;
  parsed.contact.location = legacy.location ?? null;
  parsed.professionalSummary = legacy.summary ?? null;

  parsed.skillGroups = legacy.skills?.length
    ? [{ category: null, skills: legacy.skills.map((s) => s.name) }]
    : [];

  parsed.experience = (legacy.experiences ?? []).map((exp) => ({
    id: newEntityId(),
    company: exp.company,
    title: exp.title,
    location: exp.location ?? null,
    employmentType: null,
    startDateText: exp.startDate ?? null,
    endDateText: exp.endDate ?? null,
    startDate: exp.startDate ?? null,
    endDate: exp.endDate ?? null,
    isCurrent: /present/i.test(exp.endDate ?? ""),
    achievements: exp.bullets ?? [],
    technologies: [],
    sourceEvidence: [],
  }));

  parsed.education = (legacy.education ?? []).map((edu) => ({
    id: newEntityId(),
    institution: edu.institution,
    qualification: edu.degree ?? null,
    fieldOfStudy: edu.field ?? null,
    startDateText: null,
    endDateText: edu.endDate ?? null,
    location: null,
  }));

  parsed.projects = (legacy.projects ?? []).map((p) => ({
    id: newEntityId(),
    name: p.name,
    description: p.description ?? null,
    achievements: [],
    technologies: p.skills ?? [],
    url: null,
  }));

  parsed.warnings.push({
    code: "legacy_import",
    message: "Converted from legacy ProfileExtraction format; review recommended.",
    fieldPath: null,
  });

  return parsed;
}
