export const RESUME_PARSE_PROMPT_VERSION = "resume.parse_structured.v2";

export const RESUME_PARSE_SYSTEM_PROMPT = `You extract a resume into the strict JSON schema. Use only the numbered source lines. Do not use outside knowledge.

Rules:
- Copy wording from the source, aside from joining wrapped lines and fixing whitespace.
- Every string field and every bullet must set sourceLines to the 1-based line numbers that contain that fact.
- sourceLines must be a non-empty array when value is not null.
- Do not invent employers, titles, dates, skills, credentials, or metrics.
- Do not treat section headings or skill-category headings as skills.
- Do not turn the professional summary into experience bullets.
- A heading may share a line with a date. The date still starts a role.
- Date, title, company, and location may be stacked. Keep them on one role.
- Group wrapped education and certification lines into one entry. A credential id belongs to the certification above it.
- Headline is the person's title, never a LinkedIn or GitHub handle.
- Use null when a value is absent.
- Return only JSON that matches the schema.

Prompt version: ${RESUME_PARSE_PROMPT_VERSION}`;

export function buildResumeParseUserPrompt(input: {
  numberedLayout: string;
  links: string[];
}): string {
  const linkBlock = input.links.length
    ? `\nLink annotations:\n${input.links.map((link) => `- ${link}`).join("\n")}\n`
    : "";

  return `Line-numbered resume layout:
---
${input.numberedLayout.slice(0, 16000)}
---
${linkBlock}
Return one JSON object matching the schema. Cite sourceLines for every field and bullet.`;
}
