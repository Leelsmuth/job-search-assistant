import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";
import { splitConcatenatedDateTitle } from "@/modules/resumes/normalize/hyphenation-repair";

export type ResumeSectionType =
  | "contact"
  | "summary"
  | "skills"
  | "experience"
  | "education"
  | "certifications"
  | "projects"
  | "additional";

export type ResumeSection = {
  type: ResumeSectionType;
  heading: string;
  startIndex: number;
  endIndex: number;
  lines: GroupedLine[];
};

const SECTION_PATTERNS: Array<{ type: ResumeSectionType; pattern: RegExp }> = [
  { type: "summary", pattern: /^(professional summary|career objective|about me|summary|profile)\b/i },
  { type: "skills", pattern: /^(core technical skills|technical skills|core skills|competencies|skills)\b/i },
  { type: "experience", pattern: /^(professional experience|work experience|employment history|work history|experience)\b/i },
  { type: "education", pattern: /^education\b/i },
  { type: "certifications", pattern: /^(certifications|certificates|licenses)\b/i },
  { type: "projects", pattern: /^projects\b/i },
];

const DATE_PREFIX =
  /(?:\d{1,2}\/\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4})\b/i;

export function matchSectionHeading(
  text: string
): { type: ResumeSectionType; heading: string; rest: string } | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 90) return null;

  for (const { type, pattern } of SECTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const rest = trimmed.slice(match[0].length).replace(/^[\s:|\-–—]+/, "").trim();
    if (rest && !DATE_PREFIX.test(rest)) continue;
    return { type, heading: match[0], rest };
  }

  return null;
}

function contentLinesForHeading(line: GroupedLine, rest: string): GroupedLine[] {
  if (!rest) return [];
  return splitConcatenatedDateTitle(rest).map((text, index) => ({
    text,
    page: line.page,
    items: index === 0 ? line.items : line.items.slice(-1),
    fontSize: line.fontSize,
    isBullet: false,
    lineNumber: line.lineNumber,
  }));
}

export function detectResumeSections(lines: GroupedLine[]): ResumeSection[] {
  if (lines.length === 0) return [];

  const headingIndices: Array<{
    index: number;
    heading: string;
    type: ResumeSectionType;
    rest: string;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const matched = matchSectionHeading(lines[i].text);
    if (matched) {
      headingIndices.push({
        index: i,
        heading: matched.heading,
        type: matched.type,
        rest: matched.rest,
      });
    }
  }

  if (headingIndices.length === 0) {
    return [
      {
        type: "contact",
        heading: "Header",
        startIndex: 0,
        endIndex: lines.length - 1,
        lines,
      },
    ];
  }

  const sections: ResumeSection[] = [];

  if (headingIndices[0].index > 0) {
    sections.push({
      type: "contact",
      heading: "Header",
      startIndex: 0,
      endIndex: headingIndices[0].index - 1,
      lines: lines.slice(0, headingIndices[0].index),
    });
  }

  for (let h = 0; h < headingIndices.length; h++) {
    const current = headingIndices[h];
    const start = current.index + 1;
    const end =
      h + 1 < headingIndices.length
        ? headingIndices[h + 1].index - 1
        : lines.length - 1;

    const body = start <= end ? lines.slice(start, end + 1) : [];
    const preface = contentLinesForHeading(lines[current.index], current.rest);
    const sectionLines = [...preface, ...body];
    if (sectionLines.length > 0) {
      sections.push({
        type: current.type,
        heading: current.heading,
        startIndex: start,
        endIndex: end,
        lines: sectionLines,
      });
    }
  }

  return sections;
}

export function sectionsToOutline(sections: ResumeSection[]): string {
  return sections
    .map((s) => `[${s.type}] ${s.heading}\n${s.lines.map((l) => l.text).join("\n")}`)
    .join("\n\n");
}
