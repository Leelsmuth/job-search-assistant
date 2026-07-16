import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";

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
  { type: "summary", pattern: /^(summary|professional summary|career objective|profile|about me)$/i },
  { type: "skills", pattern: /^(skills|technical skills|core technical skills|core skills|competencies)$/i },
  { type: "experience", pattern: /^(experience|work experience|professional experience|employment history|work history)$/i },
  { type: "education", pattern: /^education$/i },
  { type: "certifications", pattern: /^(certifications|certificates|licenses)$/i },
  { type: "projects", pattern: /^projects$/i },
];

function isSectionHeading(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 60) return false;
  return SECTION_PATTERNS.some(({ pattern }) => pattern.test(trimmed));
}

function detectSectionType(heading: string): ResumeSectionType {
  for (const { type, pattern } of SECTION_PATTERNS) {
    if (pattern.test(heading.trim())) return type;
  }
  return "additional";
}

export function detectResumeSections(lines: GroupedLine[]): ResumeSection[] {
  if (lines.length === 0) return [];

  const headingIndices: Array<{ index: number; heading: string; type: ResumeSectionType }> = [];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text.trim();
    if (isSectionHeading(text)) {
      headingIndices.push({
        index: i,
        heading: text,
        type: detectSectionType(text),
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

    if (start <= end) {
      sections.push({
        type: current.type,
        heading: current.heading,
        startIndex: start,
        endIndex: end,
        lines: lines.slice(start, end + 1),
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
