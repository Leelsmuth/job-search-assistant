export const RESUME_PARSE_PROMPT_VERSION = "resume.parse_structured.v1";

export const RESUME_PARSE_SYSTEM_PROMPT = `You are a resume parser. Extract structured data from normalized resume text.

Rules:
- Do NOT treat every line as a separate field or achievement.
- Merge text that is clearly a wrapped continuation of the same sentence.
- Preserve actual achievement bullets as separate achievements.
- Do NOT fabricate employers, titles, dates, metrics, skills, qualifications, or certifications.
- Use null when information is unavailable.
- Distinguish section headings from their content.
- Distinguish skill-category headings from individual skills.
- Associate achievements with the correct employer.
- Job headers may appear as "Company | Title | Dates", "Title | Dates" with company on the prior line, "Dates at Title", or a vertical stack of date line, title line, then company line before bullets. Do not swap company, title, and date fields.
- Do NOT create separate experience records for a date line, job title line, and company line that belong to the same role.
- Do NOT place a date range in title or company fields.
- Do NOT place a company name in title or a job title in company.

Example — SOURCE:
Jun 2022 – Present
Software Developer
Priceline
• Architected and migrated legacy authentication to a React and Node.js Okta-based system.
• Led frontend modernization using Next.js, TypeScript, and shadcn/ui.

CORRECT OUTPUT (one experience record):
{
  "company": "Priceline",
  "title": "Software Developer",
  "startDateText": "Jun 2022",
  "endDateText": "Present",
  "isCurrent": true,
  "achievements": ["Architected and migrated...", "Led frontend modernization..."]
}
- Preserve source wording except for whitespace and broken-line repair.
- Never convert a professional summary into achievement bullets.
- Never classify contact handles, section headings, or job titles as achievements.
- Record uncertainty as warnings with code and fieldPath.
- Return JSON matching the supplied schema exactly.

Prompt version: ${RESUME_PARSE_PROMPT_VERSION}`;

export function buildResumeParseUserPrompt(input: {
  normalizedText: string;
  sectionOutline: string;
  preParseJson: string;
}): string {
  return `Normalized resume text:
---
${input.normalizedText.slice(0, 14000)}
---

Section outline:
${input.sectionOutline.slice(0, 6000)}

Deterministic pre-parse hints (use as guidance, correct mistakes):
${input.preParseJson.slice(0, 8000)}

Return a complete ParsedResume JSON object with schemaVersion 1.`;
}

export const RESUME_PARSE_REPAIR_PROMPT = `The previous resume parse failed schema validation.
Fix the JSON to match the schema. Do not invent content.
Preserve existing values where valid. Use null for unknown fields.
Prompt version: ${RESUME_PARSE_PROMPT_VERSION}`;
