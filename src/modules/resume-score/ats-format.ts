import { parseMonthYearToken } from "@/modules/resumes/parse/experience-date-normalizer";
import type { AtsCheck, ResumeScoreDocument } from "@/modules/resume-score/types";

const ATS_FILE_TYPES = new Set(["pdf", "docx", "txt", "doc", "text"]);

const HEADING_GROUPS: Array<{ label: string; pattern: RegExp }> = [
  { label: "summary", pattern: /\b(professional summary|summary|profile)\b/i },
  { label: "experience", pattern: /\b(experience|employment|work history)\b/i },
  { label: "skills", pattern: /\b(skills|technical skills|technologies)\b/i },
  { label: "education", pattern: /\b(education|academics)\b/i },
  { label: "projects", pattern: /\b(projects|certifications)\b/i },
];

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/;

function monthIsValid(parsed: string | null): boolean {
  if (!parsed) return false;
  const month = Number(parsed.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function resumeDatesParse(text: string): { passed: boolean; detail: string } {
  const tokens = new Set<string>();
  for (const match of text.matchAll(
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b/gi
  )) {
    tokens.add(match[1]);
  }
  for (const match of text.matchAll(/\b(\d{1,2}\/\d{4})\b/g)) tokens.add(match[1]);
  for (const match of text.matchAll(/\b((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|present|current)\b/gi)) {
    tokens.add(match[1]);
    if (!/present|current/i.test(match[2])) tokens.add(match[2]);
  }
  if (tokens.size === 0) return { passed: true, detail: "No employment dates to parse." };
  const failed = [...tokens].filter((token) => !monthIsValid(parseMonthYearToken(token)));
  if (failed.length > 0) {
    return { passed: false, detail: `Could not parse ${failed.slice(0, 3).join(", ")}.` };
  }
  return { passed: true, detail: "Employment dates parse." };
}

function hasTables(text: string, document: ResumeScoreDocument): boolean {
  if (document.usesTables === true) return true;
  if (document.exportedByApp || document.usesTables === false) return false;
  if (/\|[^\n]+\|\s*\n\s*\|?\s*-{3,}/.test(text)) return true;
  const tabLines = text.split("\n").filter((line) => (line.match(/\t/g) ?? []).length >= 2);
  return tabLines.length >= 2;
}

function hasColumns(text: string, document: ResumeScoreDocument): boolean {
  if (document.usesColumns === true) return true;
  if (document.exportedByApp || document.usesColumns === false) return false;
  const wide = text.split("\n").filter((line) => /\S\s{6,}\S/.test(line));
  return wide.length >= 3;
}

export function assessAtsFormat(document: ResumeScoreDocument): AtsCheck[] {
  const text = document.text ?? "";
  const headings = HEADING_GROUPS.filter((group) => group.pattern.test(text));
  const headingsPassed = headings.length >= 2;
  const email = document.contactEmail?.trim() || (text.match(EMAIL)?.[0] ?? "");
  const phone = document.contactPhone?.trim() || (text.match(PHONE)?.[0] ?? "");
  const contactPassed = Boolean(email || phone);
  const tables = hasTables(text, document);
  const columns = hasColumns(text, document);
  const dates = resumeDatesParse(text);
  const fileType = (document.fileType ?? (document.exportedByApp ? "pdf" : "")).toLowerCase();
  const filePassed = ATS_FILE_TYPES.has(fileType);

  return [
    {
      id: "headings",
      label: "Standard headings",
      passed: headingsPassed,
      detail: headingsPassed
        ? `Found ${headings.map((group) => group.label).join(", ")}.`
        : "Use at least two standard headings such as Summary, Experience, Skills, or Education.",
    },
    {
      id: "contact",
      label: "Contact info",
      passed: contactPassed,
      detail: contactPassed ? "An email or phone number is on the resume." : "Add an email or phone number.",
    },
    {
      id: "tables",
      label: "No tables",
      passed: !tables,
      detail: tables
        ? "Tables make ATS parsing unreliable. Use a single text flow."
        : document.exportedByApp
          ? "The exported file is plain text, with no tables."
          : "No table markup detected.",
    },
    {
      id: "columns",
      label: "No columns",
      passed: !columns,
      detail: columns
        ? "Multi-column layout can scramble reading order. Keep one column."
        : document.exportedByApp
          ? "The exported file is a single column."
          : "No multi-column layout detected.",
    },
    {
      id: "dates",
      label: "Parseable dates",
      passed: dates.passed,
      detail: dates.detail,
    },
    {
      id: "fileType",
      label: "File type",
      passed: filePassed,
      detail: filePassed
        ? `File type ${fileType.toUpperCase()} is ATS-friendly.`
        : "Export a PDF, DOCX, or plain-text file.",
    },
  ];
}

export function atsFormatScore(checks: AtsCheck[]): number {
  if (checks.length === 0) return 0;
  const passed = checks.filter((check) => check.passed).length;
  return Math.round((passed / checks.length) * 100);
}
