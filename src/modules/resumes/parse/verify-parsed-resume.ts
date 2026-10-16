import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";
import {
  emptyParsedResume,
  newEntityId,
  type FieldProvenance,
  type ParsedResume,
  type ParseWarning,
} from "@/modules/resumes/schema/resume-schema";
import type { LlmParsedResume } from "@/modules/resumes/schema/llm-resume-schema";
import { isKnownSkillToken, isSkillCategoryHeading } from "@/modules/resumes/normalize/text-cleanup";
import { normalizeExperienceDates, parseMonthYearToken } from "./experience-date-normalizer";
import { looksLikeDateRange } from "./experience-semantics";
import { mergeWarnings } from "./confidence";

export type SourceMatch = "exact" | "partial" | "none";

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[•●◦∙·▪‣]/g, " ")
    .replace(/[^\p{L}\p{N}+.#/&@-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fuzzyMatchSource(value: string, sourceText: string): SourceMatch {
  const needle = normalizeForMatch(value);
  const haystack = normalizeForMatch(sourceText);
  if (!needle) return "none";
  if (haystack.includes(needle)) return "exact";

  const tokens = needle.split(" ").filter((token) => token.length > 2);
  if (tokens.length === 0) return haystack.includes(needle) ? "exact" : "none";
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  const ratio = hits / tokens.length;
  if (ratio >= 0.85) return "exact";
  if (ratio >= 0.6) return "partial";
  return "none";
}

function textForLines(lines: GroupedLine[], sourceLines: number[]): string {
  const byNumber = new Map(lines.map((line, index) => [line.lineNumber ?? index + 1, line.text]));
  return sourceLines
    .map((lineNumber) => byNumber.get(lineNumber) ?? "")
    .filter(Boolean)
    .join("\n");
}

function skillScore(name: string, match: SourceMatch): number {
  if (match === "none") return 0.2;
  if (match === "partial") return 0.48;
  return isKnownSkillToken(name) ? 0.9 : 0.7;
}

function dateTextIsValid(text: string | null | undefined): boolean {
  if (!text?.trim()) return true;
  if (/^(present|current)$/i.test(text.trim())) return true;
  return parseMonthYearToken(text) !== null;
}

function isCitedUrl(value: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(value.trim());
}

function citedValue(field: { value: string | null; sourceLines: number[] } | undefined): string | null {
  const value = field?.value?.trim();
  return value ? value : null;
}

export function llmResultToParsedResume(llm: LlmParsedResume): ParsedResume {
  const resume = emptyParsedResume();
  const provenance: FieldProvenance[] = [];

  function remember(fieldPath: string, value: string | null, sourceLines: number[]) {
    if (!value) return;
    provenance.push({
      fieldPath,
      value,
      sourceLines,
      sourceText: "",
    });
  }

  resume.contact = {
    fullName: citedValue(llm.contact.fullName),
    headline: citedValue(llm.contact.headline),
    email: citedValue(llm.contact.email),
    phone: citedValue(llm.contact.phone),
    location: citedValue(llm.contact.location),
    linkedInUrl: citedValue(llm.contact.linkedInUrl),
    githubUrl: citedValue(llm.contact.githubUrl),
    portfolioUrl: citedValue(llm.contact.portfolioUrl),
    otherLinks: llm.contact.otherLinks
      .filter((link) => link.url.trim())
      .map((link) => ({ label: link.label, url: link.url.trim() })),
    fieldSourceLines: {
      fullName: llm.contact.fullName.sourceLines,
      headline: llm.contact.headline.sourceLines,
      email: llm.contact.email.sourceLines,
      phone: llm.contact.phone.sourceLines,
      location: llm.contact.location.sourceLines,
      linkedInUrl: llm.contact.linkedInUrl.sourceLines,
      githubUrl: llm.contact.githubUrl.sourceLines,
      portfolioUrl: llm.contact.portfolioUrl.sourceLines,
    },
  };

  for (const [field, cited] of Object.entries({
    fullName: llm.contact.fullName,
    headline: llm.contact.headline,
    email: llm.contact.email,
    phone: llm.contact.phone,
    location: llm.contact.location,
    linkedInUrl: llm.contact.linkedInUrl,
    githubUrl: llm.contact.githubUrl,
  })) {
    remember(`contact.${field}`, cited.value, cited.sourceLines);
  }

  resume.professionalSummary = citedValue(llm.professionalSummary);
  remember("professionalSummary", resume.professionalSummary, llm.professionalSummary.sourceLines);

  resume.skillGroups = llm.skillGroups
    .map((group) => ({
      category: citedValue(group.category),
      skills: group.skills.map((skill) => skill.name.trim()).filter(Boolean),
      skillConfidence: group.skills.map(() => 0.5),
      skillSourceLines: group.skills.map((skill) => skill.sourceLines),
    }))
    .filter((group) => group.skills.length > 0);

  resume.experience = llm.experience.map((role) => {
    const achievements = role.achievements.map((item) => item.text.trim()).filter(Boolean);
    const achievementSourceLines = role.achievements
      .filter((item) => item.text.trim())
      .map((item) => item.sourceLines);
    const sourceLines = [
      ...role.company.sourceLines,
      ...role.title.sourceLines,
      ...role.location.sourceLines,
      ...role.startDateText.sourceLines,
      ...role.endDateText.sourceLines,
      ...achievementSourceLines.flat(),
    ];
    return {
      id: newEntityId(),
      company: citedValue(role.company),
      title: citedValue(role.title),
      location: citedValue(role.location),
      employmentType: citedValue(role.employmentType),
      startDateText: citedValue(role.startDateText),
      endDateText: citedValue(role.endDateText),
      startDate: null,
      endDate: null,
      isCurrent: role.isCurrent,
      achievements,
      technologies: role.technologies.map((item) => item.name.trim()).filter(Boolean),
      sourceEvidence: [],
      sourceLines: [...new Set(sourceLines)],
      achievementSourceLines,
    };
  });

  resume.education = llm.education.map((entry) => ({
    id: newEntityId(),
    institution: citedValue(entry.institution),
    qualification: citedValue(entry.qualification),
    fieldOfStudy: citedValue(entry.fieldOfStudy),
    startDateText: citedValue(entry.startDateText),
    endDateText: citedValue(entry.endDateText),
    location: citedValue(entry.location),
    sourceLines: [
      ...entry.institution.sourceLines,
      ...entry.qualification.sourceLines,
      ...entry.fieldOfStudy.sourceLines,
    ],
  }));

  resume.certifications = llm.certifications
    .map((cert) => ({
      id: newEntityId(),
      name: citedValue(cert.name) ?? "",
      issuer: citedValue(cert.issuer),
      issuedDateText: citedValue(cert.issuedDateText),
      expirationDateText: citedValue(cert.expirationDateText),
      credentialId: citedValue(cert.credentialId),
      credentialUrl: citedValue(cert.credentialUrl),
      sourceEvidence: [],
      sourceLines: [...cert.name.sourceLines, ...cert.credentialId.sourceLines],
    }))
    .filter((cert) => cert.name.trim().length > 0);

  resume.projects = llm.projects
    .map((project) => ({
      id: newEntityId(),
      name: citedValue(project.name) ?? "",
      description: citedValue(project.description),
      achievements: project.achievements.map((item) => item.text.trim()).filter(Boolean),
      technologies: project.technologies.map((item) => item.name.trim()).filter(Boolean),
      url: citedValue(project.url),
    }))
    .filter((project) => project.name.trim().length > 0);

  resume.warnings = llm.warnings;
  resume.fieldProvenance = provenance;
  return resume;
}

export function verifyParsedResume(resume: ParsedResume, lines: GroupedLine[]): ParsedResume {
  const warnings: ParseWarning[] = [];
  const provenance: FieldProvenance[] = [];

  function cite(fieldPath: string, value: string, sourceLines: number[] | undefined, required: boolean) {
    let citedLines = sourceLines ?? [];
    if (citedLines.length === 0) {
      const found = lines.findIndex((line) => fuzzyMatchSource(value, line.text) !== "none");
      if (found >= 0) citedLines = [lines[found].lineNumber ?? found + 1];
    }
    const cited = textForLines(lines, citedLines);
    if (citedLines.length === 0) {
      warnings.push({
        code: required ? "missing_source_lines" : "uncited_fact",
        message: required
          ? `Dropped ${fieldPath} because it did not cite source lines.`
          : `Flagged ${fieldPath} because it did not cite source lines.`,
        fieldPath,
      });
      return { keep: !required, match: "none" as const, sourceText: "" };
    }
    sourceLines = citedLines;
    if (isCitedUrl(value)) {
      provenance.push({
        fieldPath,
        value,
        sourceLines,
        sourceText: cited,
        confidence: 0.9,
      });
      return { keep: true, match: "exact" as const, sourceText: cited };
    }
    const match = fuzzyMatchSource(value, cited);
    if (match === "none") {
      warnings.push({
        code: "source_mismatch",
        message: `Rejected ${fieldPath} because it does not match the cited source lines.`,
        fieldPath,
      });
      return { keep: false, match, sourceText: cited };
    }
    if (match === "partial") {
      warnings.push({
        code: "low_confidence",
        message: `Flagged ${fieldPath} because it only partially matches the cited source lines.`,
        fieldPath,
      });
    }
    provenance.push({
      fieldPath,
      value,
      sourceLines,
      sourceText: cited,
      confidence: match === "exact" ? 0.9 : 0.48,
    });
    return { keep: true, match, sourceText: cited };
  }

  const contact = { ...resume.contact, fieldSourceLines: { ...(resume.contact.fieldSourceLines ?? {}) } };
  const contactFields = [
    "fullName",
    "headline",
    "email",
    "phone",
    "location",
    "linkedInUrl",
    "githubUrl",
    "portfolioUrl",
  ] as const;
  for (const field of contactFields) {
    const value = contact[field];
    if (!value) continue;
    const decision = cite(`contact.${field}`, value, contact.fieldSourceLines?.[field], false);
    if (!decision.keep) contact[field] = null;
  }

  const summaryDecision = resume.professionalSummary
    ? cite("professionalSummary", resume.professionalSummary, provenanceSource(resume, "professionalSummary"), false)
    : null;

  const skillGroups = resume.skillGroups
    .map((group, groupIndex) => {
      const skills: string[] = [];
      const skillConfidence: number[] = [];
      const skillSourceLines: number[][] = [];
      group.skills.forEach((skill, skillIndex) => {
        if (isSkillCategoryHeading(skill) || skill.split(/\s+/).length > 8) {
          warnings.push({
            code: "skill_rejected",
            message: `Rejected skill "${skill}" because it is a heading or a sentence.`,
            fieldPath: `skillGroups.${groupIndex}.skills.${skillIndex}`,
          });
          return;
        }
        const sourceLines = group.skillSourceLines?.[skillIndex] ?? [];
        const decision = cite(
          `skillGroups.${groupIndex}.skills.${skillIndex}`,
          skill,
          sourceLines,
          true
        );
        if (!decision.keep) return;
        skills.push(skill);
        skillConfidence.push(skillScore(skill, decision.match));
        skillSourceLines.push(sourceLines);
      });
      return {
        category: group.category,
        skills,
        skillConfidence,
        skillSourceLines,
      };
    })
    .filter((group) => group.skills.length > 0);

  const experience = resume.experience.map((role, roleIndex) => {
    const company = role.company
      ? cite(`experience.${roleIndex}.company`, role.company, role.sourceLines, false)
      : null;
    const title = role.title
      ? cite(`experience.${roleIndex}.title`, role.title, role.sourceLines, false)
      : null;
    const achievements: string[] = [];
    const achievementSourceLines: number[][] = [];
    role.achievements.forEach((achievement, index) => {
      const sourceLines = role.achievementSourceLines?.[index] ?? role.sourceLines ?? [];
      const decision = cite(
        `experience.${roleIndex}.achievements.${index}`,
        achievement,
        sourceLines,
        true
      );
      if (!decision.keep) return;
      achievements.push(achievement);
      achievementSourceLines.push(sourceLines);
    });

    let startDateText = role.startDateText;
    let endDateText = role.endDateText;
    let startDate = role.startDate;
    let endDate = role.endDate;
    let isCurrent = role.isCurrent;
    if ((startDateText && looksLikeDateRange(startDateText)) || (endDateText && looksLikeDateRange(endDateText))) {
      const normalized = normalizeExperienceDates({
        dateRange: startDateText && looksLikeDateRange(startDateText) ? startDateText : null,
        startDateText,
        endDateText,
      });
      startDateText = normalized.startDateText;
      endDateText = normalized.endDateText;
      startDate = normalized.startDate;
      endDate = normalized.endDate;
      isCurrent = normalized.isCurrent;
    } else {
      const normalized = normalizeExperienceDates({ startDateText, endDateText });
      startDate = normalized.startDate;
      endDate = normalized.endDate;
      isCurrent = normalized.isCurrent || isCurrent;
    }

    if (!dateTextIsValid(startDateText) || !dateTextIsValid(endDateText)) {
      warnings.push({
        code: "unparsed_date",
        message: `Could not parse dates for experience ${roleIndex + 1}.`,
        fieldPath: `experience.${roleIndex}`,
      });
      if (!dateTextIsValid(startDateText)) startDate = null;
      if (!dateTextIsValid(endDateText)) endDate = null;
    }

    const companyUrl = role.companyUrl
      ? cite(
          `experience.${roleIndex}.companyUrl`,
          role.companyUrl,
          (role as { companyUrlSourceLines?: number[] }).companyUrlSourceLines ?? role.sourceLines,
          false
        )
      : null;

    return {
      ...role,
      company: company && !company.keep ? null : role.company,
      title: title && !title.keep ? null : role.title,
      companyUrl: companyUrl && !companyUrl.keep ? null : role.companyUrl,
      achievements,
      achievementSourceLines,
      startDateText,
      endDateText,
      startDate,
      endDate,
      isCurrent,
    };
  });

  for (const [index, entry] of resume.education.entries()) {
    for (const field of ["institution", "qualification", "fieldOfStudy"] as const) {
      const value = entry[field];
      if (!value) continue;
      cite(`education.${index}.${field}`, value, entry.sourceLines, false);
    }
    if (!dateTextIsValid(entry.startDateText) || !dateTextIsValid(entry.endDateText)) {
      warnings.push({
        code: "unparsed_date",
        message: `Could not parse dates for education ${index + 1}.`,
        fieldPath: `education.${index}`,
      });
    }
  }

  for (const [index, cert] of resume.certifications.entries()) {
    cite(`certifications.${index}.name`, cert.name, cert.sourceLines, false);
    if (cert.credentialId) {
      cite(`certifications.${index}.credentialId`, cert.credentialId, cert.sourceLines, false);
    }
    if (cert.credentialUrl) {
      cite(`certifications.${index}.credentialUrl`, cert.credentialUrl, cert.sourceLines, false);
    }
  }

  return {
    ...resume,
    contact,
    professionalSummary: summaryDecision && !summaryDecision.keep ? null : resume.professionalSummary,
    skillGroups,
    experience,
    warnings: mergeWarnings(resume.warnings, warnings),
    fieldProvenance: provenance,
  };
}

function provenanceSource(resume: ParsedResume, fieldPath: string): number[] {
  return resume.fieldProvenance?.find((item) => item.fieldPath === fieldPath)?.sourceLines ?? [];
}
