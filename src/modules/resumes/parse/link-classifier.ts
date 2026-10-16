import type { ExtractedLink } from "@/modules/resumes/extract/types";
import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";
import type { ParsedResume } from "@/modules/resumes/schema/resume-schema";
import { detectResumeSections, type ResumeSectionType } from "./resume-section-detector";

export type AnnotationLinkKind =
  | "email"
  | "linkedin"
  | "github"
  | "portfolio"
  | "company"
  | "credential";

const CREDENTIAL_HOST = /certmetrics|credly\.com|credential\.net|accredible\.com/i;

function lineNumberOf(line: GroupedLine, index: number): number {
  return line.lineNumber ?? index + 1;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.pathname === "/" && !parsed.search && !parsed.hash) {
      return `${parsed.origin}`;
    }
  } catch {
    // mailto and other non-URL annotations stay as written
  }
  return trimmed;
}

export function classifyAnnotationUrl(url: string): AnnotationLinkKind | "email" {
  const value = normalizeUrl(url);
  if (/^mailto:/i.test(value)) return "email";
  if (/linkedin\.com/i.test(value)) return "linkedin";
  if (/github\.com/i.test(value)) return "github";
  if (CREDENTIAL_HOST.test(value)) return "credential";
  return "portfolio";
}

function nearestLine(
  lines: GroupedLine[],
  link: ExtractedLink
): { line: GroupedLine; index: number } | null {
  let best: { line: GroupedLine; index: number; dist: number } | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.page !== link.page) continue;
    const ys = line.items
      .map((item) => item.y)
      .filter((y): y is number => typeof y === "number");
    if (ys.length === 0 || typeof link.y !== "number") continue;
    const y = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    const dist = Math.abs(y - link.y);
    if (dist > 12) continue;
    if (!best || dist < best.dist) best = { line, index, dist };
  }
  return best ? { line: best.line, index: best.index } : null;
}

function sectionTypeAt(lines: GroupedLine[], index: number): ResumeSectionType | "contact" {
  const sections = detectResumeSections(lines);
  const number = lineNumberOf(lines[index], index);
  for (const section of sections) {
    const hit = section.lines.some(
      (line, lineIndex) => (line.lineNumber ?? lineIndex + 1) === number || line === lines[index]
    );
    if (hit) return section.type;
  }
  if (index < (sections[0]?.startIndex ?? lines.length)) return "contact";
  return "contact";
}

function rememberSource(
  contact: ParsedResume["contact"],
  field: string,
  lineNo: number | null
) {
  if (!lineNo) return;
  contact.fieldSourceLines = contact.fieldSourceLines ?? {};
  const existing = contact.fieldSourceLines[field] ?? [];
  if (!existing.includes(lineNo)) contact.fieldSourceLines[field] = [...existing, lineNo];
}

/**
 * Place annotation links on the line they sit on.
 * Company and credential links stay off contact.otherLinks.
 */
export function attachClassifiedLinks(
  resume: ParsedResume,
  lines: GroupedLine[],
  links: ExtractedLink[]
): ParsedResume {
  const contact = {
    ...resume.contact,
    otherLinks: [...resume.contact.otherLinks],
    fieldSourceLines: { ...(resume.contact.fieldSourceLines ?? {}) },
  };
  const experience = resume.experience.map((role) => ({ ...role }));
  const certifications = resume.certifications.map((cert) => ({ ...cert }));
  const consumed = new Set<string>();

  for (const link of links) {
    const url = normalizeUrl(link.url);
    if (!url) continue;
    const anchor = nearestLine(lines, link);
    const lineNo = anchor ? lineNumberOf(anchor.line, anchor.index) : null;
    const section = anchor ? sectionTypeAt(lines, anchor.index) : "contact";
    let kind = classifyAnnotationUrl(url);

    if (kind === "portfolio" && section === "experience") kind = "company";
    if (kind === "portfolio" && section === "certifications") kind = "credential";
    if (kind === "credential" && section === "experience") kind = "company";

    if (kind === "email") {
      const email = decodeURIComponent(url.replace(/^mailto:/i, "").split("?")[0]);
      if (email.includes("@")) contact.email = contact.email ?? email;
      rememberSource(contact, "email", lineNo);
      consumed.add(url);
      continue;
    }

    if (kind === "linkedin") {
      contact.linkedInUrl = contact.linkedInUrl ?? url;
      rememberSource(contact, "linkedInUrl", lineNo);
      consumed.add(url);
      continue;
    }

    if (kind === "github") {
      contact.githubUrl = contact.githubUrl ?? url;
      rememberSource(contact, "githubUrl", lineNo);
      consumed.add(url);
      continue;
    }

    if (kind === "credential") {
      const cert =
        certifications.find((entry) => (entry.sourceLines ?? []).includes(lineNo ?? -1)) ??
        certifications.find((entry) => !entry.credentialUrl) ??
        certifications[0];
      if (cert) {
        cert.credentialUrl = cert.credentialUrl ?? url;
        if (lineNo && !(cert.sourceLines ?? []).includes(lineNo)) {
          cert.sourceLines = [...(cert.sourceLines ?? []), lineNo];
        }
      }
      consumed.add(url);
      continue;
    }

    if (kind === "company") {
      const role =
        experience.find((entry) => (entry.sourceLines ?? []).includes(lineNo ?? -1)) ??
        experience.find((entry) => {
          const company = entry.company?.trim().toLowerCase();
          return Boolean(company && anchor && anchor.line.text.toLowerCase().includes(company));
        });
      if (role) {
        role.companyUrl = role.companyUrl ?? url;
        const sourced = role as { companyUrlSourceLines?: number[] };
        if (lineNo) sourced.companyUrlSourceLines = [lineNo];
        consumed.add(url);
        continue;
      }
    }

    contact.portfolioUrl = contact.portfolioUrl ?? url;
    rememberSource(contact, "portfolioUrl", lineNo);
    consumed.add(url);
  }

  if (contact.portfolioUrl && consumed.has(contact.portfolioUrl)) {
    const portfolioKind = classifyAnnotationUrl(contact.portfolioUrl);
    if (portfolioKind === "credential" || portfolioKind === "company") {
      contact.portfolioUrl = null;
    }
  }
  contact.otherLinks = contact.otherLinks.filter((item) => {
    const kind = classifyAnnotationUrl(item.url);
    return kind !== "credential" && kind !== "company" && kind !== "linkedin" && kind !== "github";
  });

  return { ...resume, contact, experience, certifications };
}
