import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";
import type { ExtractedLink } from "@/modules/resumes/extract/types";
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
import { looksLikeDateRange, looksLikeJobTitle } from "./experience-semantics";
import { parseSkillLines } from "./skill-line-parser";
import { parseCertificationEntries, parseEducationEntries } from "./education-cert-parser";

const EMAIL = /[\w.+-]+@[\w.-]+\.\w+/;
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/;
const LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[\w/-]+/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i;
const URL = /https?:\/\/[\w.-]+(?:\/[\w./?%&=-]*)?/i;

export type PreParseHints = {
  contact: Contact;
  summaryLines: string[];
  skillCategoryLines: ReturnType<typeof parseSkillLines>;
  experienceBlocks: ExperienceBlock[];
  educationLines: string[];
  educationEntries: ReturnType<typeof parseEducationEntries>;
  certificationLines: string[];
  certificationEntries: ReturnType<typeof parseCertificationEntries>;
  projectLines: string[];
  unclassifiedLines: string[];
};

function lineNumber(line: GroupedLine, index: number): number {
  return line.lineNumber ?? index + 1;
}

function isSocialHandle(text: string, links: ExtractedLink[]): boolean {
  const trimmed = text.trim().replace(/^@/, "");
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (LINKEDIN.test(trimmed) || GITHUB.test(trimmed) || EMAIL.test(trimmed)) return true;
  if (looksLikeJobTitle(trimmed)) return false;

  for (const link of links) {
    const linkedIn = link.url.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (linkedIn && decodeURIComponent(linkedIn[1]).toLowerCase() === trimmed.toLowerCase()) {
      return true;
    }
    const github = link.url.match(/github\.com\/([^/?#]+)/i);
    if (github && github[1].toLowerCase() === trimmed.toLowerCase()) return true;
  }

  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(trimmed);
}

export function applyAnnotationLinks(contact: Contact, links: ExtractedLink[]): Contact {
  const next = { ...contact, otherLinks: [...contact.otherLinks] };
  for (const link of links) {
    const url = link.url.trim();
    if (/^mailto:/i.test(url)) {
      const email = decodeURIComponent(url.replace(/^mailto:/i, "").split("?")[0]);
      if (email.includes("@")) next.email = next.email ?? email;
      continue;
    }
    if (/linkedin\.com/i.test(url)) {
      next.linkedInUrl = next.linkedInUrl ?? url;
      continue;
    }
    if (/github\.com/i.test(url)) {
      next.githubUrl = next.githubUrl ?? url;
      continue;
    }
    if (!next.portfolioUrl) next.portfolioUrl = url;
    else if (!next.otherLinks.some((item) => item.url === url)) {
      next.otherLinks.push({ label: null, url });
    }
  }
  return next;
}

function extractContactFromLines(lines: GroupedLine[], links: ExtractedLink[] = []): Contact {
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
      !URL.test(t) &&
      !isSocialHandle(t, links)
    );
  });

  if (nonContactLines.length > 0) {
    contact.fullName = nonContactLines[0].text.trim();
    const titleLine = nonContactLines.find((line, index) => index > 0 && looksLikeJobTitle(line.text));
    if (titleLine) {
      contact.headline = titleLine.text.trim();
    } else if (
      nonContactLines.length > 1 &&
      nonContactLines[1].text.length < 80 &&
      !isSocialHandle(nonContactLines[1].text, links)
    ) {
      contact.headline = nonContactLines[1].text.trim();
    }
  }

  contact.fieldSourceLines = {};
  lines.forEach((line, index) => {
    const number = lineNumber(line, index);
    if (contact.fullName && line.text.trim() === contact.fullName) {
      contact.fieldSourceLines!.fullName = [number];
    }
    if (contact.headline && line.text.trim() === contact.headline) {
      contact.fieldSourceLines!.headline = [number];
    }
    if (contact.email && line.text.includes(contact.email)) {
      contact.fieldSourceLines!.email = [number];
    }
  });

  const locationLine = lines.find((l) =>
    /(?:^|\|)\s*[A-Za-z .,-]+(?:Canada|USA|United States|Remote|Toronto|Vancouver|Ontario)\b/i.test(l.text)
  );
  if (locationLine) contact.location = locationLine.text.replace(/^location:\s*/i, "").trim();

  return applyAnnotationLinks(contact, links);
}

export function deterministicPreParse(
  sections: ResumeSection[],
  options?: { links?: ExtractedLink[] }
): PreParseHints {
  const hints: PreParseHints = {
    contact: emptyParsedResume().contact,
    summaryLines: [],
    skillCategoryLines: [],
    experienceBlocks: [],
    educationLines: [],
    educationEntries: [],
    certificationLines: [],
    certificationEntries: [],
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
        hints.contact = extractContactFromLines(section.lines, options?.links ?? []);
        break;
      case "skills":
        hints.skillCategoryLines = parseSkillLines(section.lines);
        break;
      case "experience":
        hints.experienceBlocks = parseExperienceBlocks(section.lines);
        break;
      case "education":
        hints.educationLines = section.lines.map((l) => l.text.trim()).filter(Boolean);
        hints.educationEntries = parseEducationEntries(section.lines);
        break;
      case "certifications":
        hints.certificationLines = section.lines.map((l) => l.text.trim()).filter(Boolean);
        hints.certificationEntries = parseCertificationEntries(section.lines);
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

  resume.skillGroups = hints.skillCategoryLines.map((group) => ({
    category: group.category,
    skills: group.skills.map((skill) => skill.name),
    skillConfidence: group.skills.map((skill) => skill.confidence),
    skillSourceLines: group.skills.map((skill) => skill.sourceLines),
  }));

  resume.experience = reconcileExperienceList(
    hints.experienceBlocks.map((block) => {
      const achievementLines = block.lines.filter((line) => {
        const text = line.text.trim();
        if (!text || text === block.headerLine) return false;
        if (BULLET_PREFIX.test(text) || line.isBullet) return true;
        if (DATE_RANGE.test(text) || looksLikeDateRange(text)) return false;
        if (text === block.company || text === block.title || text === block.location) return false;
        if (/^(key contributions|highlights|responsibilities)$/i.test(text)) return false;
        return text.length > 30 && /[.!]/.test(text);
      });
      const achievements = achievementLines.map((line) =>
        line.text.trim().replace(BULLET_PREFIX, "").trim()
      );

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
        sourceLines: block.lines
          .map((line) => line.lineNumber)
          .filter((lineNumber): lineNumber is number => lineNumber !== undefined),
        achievementSourceLines: achievementLines.map((line) =>
          line.lineNumber ? [line.lineNumber] : []
        ),
        sourceEvidence: block.lines.map((l) => ({
          page: l.page,
          lineStart: l.lineNumber ?? null,
          lineEnd: l.lineNumber ?? null,
          rawText: l.text,
          normalizedText: l.text,
        })),
      };
    })
  );

  resume.education =
    hints.educationEntries.length > 0
      ? hints.educationEntries
      : hints.educationLines.map((line) => ({
          id: newEntityId(),
          institution: line.split("|")[0]?.trim() ?? line,
          qualification: line.split("|")[1]?.trim() ?? null,
          fieldOfStudy: null,
          startDateText: null,
          endDateText: null,
          location: null,
        }));

  resume.certifications =
    hints.certificationEntries.length > 0
      ? hints.certificationEntries
      : hints.certificationLines.map((line) => ({
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
