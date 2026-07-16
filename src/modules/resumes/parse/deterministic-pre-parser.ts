import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";
import type { ResumeSection } from "./resume-section-detector";
import {
  BULLET_PREFIX,
  DATE_RANGE,
  parseExperienceBlocks,
  type ExperienceBlock,
} from "./experience-block-parser";
import {
  type Contact,
  type ParsedResume,
  newEntityId,
  emptyParsedResume,
} from "@/modules/resumes/schema/resume-schema";
import { normalizeExperienceDates } from "./experience-date-normalizer";
import { reconcileExperienceList } from "./experience-reconciliation";
import { looksLikeDateRange } from "./experience-semantics";

const EMAIL = /[\w.+-]+@[\w.-]+\.\w+/;
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/;
const LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[\w/-]+/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i;
const URL = /https?:\/\/[\w.-]+(?:\/[\w./?%&=-]*)?/i;

export type PreParseHints = {
  contact: Contact;
  summaryLines: string[];
  skillCategoryLines: Array<{ category: string | null; skills: string[] }>;
  experienceBlocks: ExperienceBlock[];
  educationLines: string[];
  certificationLines: string[];
  projectLines: string[];
  unclassifiedLines: string[];
};

function extractContactFromLines(lines: GroupedLine[]): Contact {
  const text = lines.map((l) => l.text).join("\n");
  const contact: Contact = {
    fullName: null,
    headline: null,
    email: null,
    phone: null,
    location: null,
    linkedInUrl: null,
    githubUrl: null,
    portfolioUrl: null,
    otherLinks: [],
  };

  const emailMatch = text.match(EMAIL);
  if (emailMatch) contact.email = emailMatch[0];

  const phoneMatch = text.match(PHONE);
  if (phoneMatch) contact.phone = phoneMatch[0].trim();

  const linkedInMatch = text.match(LINKEDIN);
  if (linkedInMatch) contact.linkedInUrl = linkedInMatch[0];

  const githubMatch = text.match(GITHUB);
  if (githubMatch) contact.githubUrl = githubMatch[0];

  const urlMatches = text.match(new RegExp(URL.source, "gi")) ?? [];
  for (const url of urlMatches) {
    if (contact.linkedInUrl?.includes(url) || contact.githubUrl?.includes(url)) continue;
    if (!contact.portfolioUrl) contact.portfolioUrl = url;
    else contact.otherLinks.push({ label: null, url });
  }

  const nonContactLines = lines.filter((l) => {
    const t = l.text;
    return (
      !EMAIL.test(t) &&
      !PHONE.test(t) &&
      !LINKEDIN.test(t) &&
      !GITHUB.test(t) &&
      !URL.test(t)
    );
  });

  if (nonContactLines.length > 0) {
    contact.fullName = nonContactLines[0].text.trim();
    if (nonContactLines.length > 1 && nonContactLines[1].text.length < 80) {
      contact.headline = nonContactLines[1].text.trim();
    }
  }

  const locationLine = lines.find((l) =>
    /(?:^|\|)\s*[A-Za-z .,-]+(?:Canada|USA|United States|Remote|Toronto|Vancouver|Ontario)\b/i.test(l.text)
  );
  if (locationLine) contact.location = locationLine.text.replace(/^location:\s*/i, "").trim();

  return contact;
}

function parseSkillSection(lines: GroupedLine[]): PreParseHints["skillCategoryLines"] {
  const groups: PreParseHints["skillCategoryLines"] = [];
  let currentCategory: string | null = null;
  let currentSkills: string[] = [];

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    const categoryMatch = text.match(/^([A-Za-z][A-Za-z\s/&]+):\s*(.+)$/);
    if (categoryMatch && categoryMatch[2].includes(",")) {
      if (currentSkills.length > 0) {
        groups.push({ category: currentCategory, skills: currentSkills });
      }
      currentCategory = categoryMatch[1].trim();
      currentSkills = categoryMatch[2].split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      continue;
    }

    if (text.endsWith(":") && text.length < 40) {
      if (currentSkills.length > 0) {
        groups.push({ category: currentCategory, skills: currentSkills });
      }
      currentCategory = text.replace(/:$/, "").trim();
      currentSkills = [];
      continue;
    }

    if (text.includes(",")) {
      currentSkills.push(...text.split(/[,;|]/).map((s) => s.trim()).filter(Boolean));
    } else {
      currentSkills.push(text);
    }
  }

  if (currentSkills.length > 0) {
    groups.push({ category: currentCategory, skills: currentSkills });
  }

  return groups;
}

function parseExperienceBlock(lines: GroupedLine[]): ExperienceBlock[] {
  return parseExperienceBlocks(lines);
}

export function deterministicPreParse(sections: ResumeSection[]): PreParseHints {
  const hints: PreParseHints = {
    contact: emptyParsedResume().contact,
    summaryLines: [],
    skillCategoryLines: [],
    experienceBlocks: [],
    educationLines: [],
    certificationLines: [],
    projectLines: [],
    unclassifiedLines: [],
  };

  for (const section of sections) {
    if (section.type === "summary" || /career objective|professional summary/i.test(section.heading)) {
      hints.summaryLines = section.lines.map((l) => l.text.trim()).filter(Boolean);
      continue;
    }
    switch (section.type) {
      case "contact":
        hints.contact = extractContactFromLines(section.lines);
        break;
      case "skills":
        hints.skillCategoryLines = parseSkillSection(section.lines);
        break;
      case "experience":
        hints.experienceBlocks = parseExperienceBlock(section.lines);
        break;
      case "education":
        hints.educationLines = section.lines.map((l) => l.text.trim()).filter(Boolean);
        break;
      case "certifications":
        hints.certificationLines = section.lines.map((l) => l.text.trim()).filter(Boolean);
        break;
      case "projects":
        hints.projectLines = section.lines.map((l) => l.text.trim()).filter(Boolean);
        break;
      default:
        hints.unclassifiedLines.push(
          ...section.lines.map((l) => l.text.trim()).filter(Boolean)
        );
    }
  }

  return hints;
}

export function preParseHintsToPartialResume(hints: PreParseHints): ParsedResume {
  const resume = emptyParsedResume();
  resume.contact = hints.contact;
  resume.professionalSummary = hints.summaryLines.join(" ").trim() || null;

  resume.skillGroups = hints.skillCategoryLines.map((g) => ({
    category: g.category,
    skills: g.skills,
  }));

  resume.experience = reconcileExperienceList(
    hints.experienceBlocks.map((block) => {
      const achievements = block.lines
        .map((l) => l.text.trim())
        .filter((text) => {
          if (!text || text === block.headerLine) return false;
          if (BULLET_PREFIX.test(text)) return true;
          if (DATE_RANGE.test(text) || looksLikeDateRange(text)) return false;
          if (text === block.company || text === block.title) return false;
          return text.length > 30 && /[.!]/.test(text);
        })
        .map((text) => text.replace(BULLET_PREFIX, "").trim());

      const dates = normalizeExperienceDates({ dateRange: block.dateRange });
      const headerFallback =
        block.headerLine &&
        !looksLikeDateRange(block.headerLine) &&
        block.headerLine !== block.company
          ? block.headerLine
          : null;

      return {
        id: newEntityId(),
        company: block.company ?? null,
        title: block.title ?? headerFallback,
        location: block.location ?? null,
        employmentType: null,
        startDateText: dates.startDateText,
        endDateText: dates.endDateText,
        startDate: dates.startDate,
        endDate: dates.endDate,
        isCurrent: dates.isCurrent,
        achievements,
        technologies: [],
        sourceEvidence: block.lines.map((l) => ({
          page: l.page,
          rawText: l.text,
          normalizedText: l.text,
        })),
      };
    })
  );

  resume.education = hints.educationLines.map((line) => ({
    id: newEntityId(),
    institution: line.split("|")[0]?.trim() ?? line,
    qualification: line.split("|")[1]?.trim() ?? null,
    fieldOfStudy: null,
    startDateText: null,
    endDateText: null,
    location: null,
  }));

  resume.certifications = hints.certificationLines.map((line) => ({
    id: newEntityId(),
    name: line.split("|")[0]?.trim() ?? line,
    issuer: line.split("|")[1]?.trim() ?? null,
    issuedDateText: null,
    expirationDateText: null,
    credentialId: null,
    credentialUrl: null,
    sourceEvidence: [],
  }));

  resume.unclassified = hints.unclassifiedLines.map((text) => ({
    id: newEntityId(),
    text,
  }));

  return resume;
}
