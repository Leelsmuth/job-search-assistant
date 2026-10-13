import type { ResolvedResume, TextBlock } from "@/modules/documents/types";

function dateRange(start: string | null, end: string | null): string | null {
  if (start && end) return `${start} – ${end}`;
  return start ?? end;
}

export function resumeBlocks(resume: ResolvedResume): TextBlock[] {
  const blocks: TextBlock[] = [{ kind: "name", text: resume.header.name || "Resume" }];
  const contact = [
    resume.header.headline,
    resume.header.location,
    resume.header.yearsExperience != null
      ? `${resume.header.yearsExperience} years' experience`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (contact) blocks.push({ kind: "contact", text: contact });

  if (resume.summary?.trim()) {
    blocks.push({ kind: "section", text: "Summary" });
    blocks.push({ kind: "body", text: resume.summary.trim() });
  }

  if (resume.experiences.length > 0) {
    blocks.push({ kind: "section", text: "Experience" });
    for (const experience of resume.experiences) {
      blocks.push({ kind: "role", text: `${experience.title} — ${experience.company}` });
      const meta = [dateRange(experience.startDate, experience.endDate), experience.location]
        .filter(Boolean)
        .join(" · ");
      if (meta) blocks.push({ kind: "meta", text: meta });
      for (const bullet of experience.bullets) {
        blocks.push({ kind: "bullet", text: bullet });
      }
    }
  }

  if (resume.projects.length > 0) {
    blocks.push({ kind: "section", text: "Projects" });
    for (const project of resume.projects) {
      blocks.push({ kind: "role", text: project.name });
      const detail = [project.description, project.skills.length ? project.skills.join(", ") : null]
        .filter(Boolean)
        .join(" · ");
      if (detail) blocks.push({ kind: "body", text: detail });
    }
  }

  if (resume.skills.length > 0) {
    blocks.push({ kind: "section", text: "Skills" });
    blocks.push({ kind: "body", text: resume.skills.join(", ") });
  }

  if (resume.education.length > 0) {
    blocks.push({ kind: "section", text: "Education" });
    for (const item of resume.education) {
      blocks.push({
        kind: "body",
        text: [item.degree, item.field, item.institution, item.endDate].filter(Boolean).join(", "),
      });
    }
  }

  if (resume.certifications.length > 0) {
    blocks.push({ kind: "section", text: "Certifications" });
    for (const item of resume.certifications) {
      blocks.push({
        kind: "body",
        text: item.issuer ? `${item.name} — ${item.issuer}` : item.name,
      });
    }
  }

  return blocks;
}

export function letterBlocks(body: string): TextBlock[] {
  return body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ kind: "body" as const, text }));
}

export function renderPlainText(blocks: TextBlock[]): string {
  return blocks
    .map((block) => (block.kind === "bullet" ? `- ${block.text}` : block.text))
    .join("\n");
}

export function renderResumePlainText(resume: ResolvedResume): string {
  return renderPlainText(resumeBlocks(resume));
}
