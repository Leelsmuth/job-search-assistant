import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { extractTextDocument } from "@/modules/resumes/extract/text-resume-extractor";
import { extractPdfDocument } from "@/modules/resumes/extract/pdf-text-extractor";
import { normalizeExtractedDocument } from "@/modules/resumes/normalize/extracted-document-normalizer";
import { parseResumeStructure } from "@/modules/resumes/parse/resume-structure-parser";
import { buildStrictParsedResumeJsonSchema } from "@/modules/resumes/schema/llm-resume-schema";
import type { ParsedResume } from "@/modules/resumes/schema/resume-schema";
import {
  ANONYMISED_RESUME_TEXT,
  COMPANY_URL,
  CREDENTIAL_URL,
  PORTFOLIO_URL,
  ROLE_SUMMARY_LINES,
  buildAnonymisedResumePdf,
} from "@/test/fixtures/resumes/anonymised-jordan-hale";

const createMock = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } };
  },
}));

const originalKey = process.env.OPENAI_API_KEY;

function cited(value: string | null, sourceLines: number[] = []) {
  return { value, sourceLines };
}

function expectGoldenResume(parsed: ParsedResume) {
  expect(parsed.contact.fullName).toBe("Jordan Hale");
  expect(parsed.contact.headline).toBe("Senior Software Developer");
  expect(parsed.contact.headline).not.toMatch(/jordan-hale/i);
  expect(parsed.contact.email).toBe("jordan.hale@example.com");

  expect(parsed.experience).toHaveLength(4);
  const bullets = parsed.experience.map((role) => role.achievements.length);
  expect(bullets).toEqual([11, 4, 4, 4]);
  const achievements = parsed.experience.flatMap((role) => role.achievements);
  for (const summary of ROLE_SUMMARY_LINES) {
    expect(achievements).not.toContain(summary);
  }
  expect(achievements.some((bullet) => bullet.includes("cut interface delivery time by 35 percent"))).toBe(true);
  expect(achievements.some((bullet) => bullet.includes("MongoDB indexes"))).toBe(true);
  expect(achievements.some((bullet) => bullet === "delivery time by 35 percent.")).toBe(false);
  expect(achievements.some((bullet) => bullet === "with MongoDB indexes.")).toBe(false);
  expect(parsed.experience.map((role) => role.company)).not.toContain("MongoDB");

  const [northwind, brightpath, harbor, lumen] = parsed.experience;
  expect(northwind.company).toBe("Northwind Labs");
  expect(northwind.title).toBe("Software Developer");
  expect(northwind.startDate).toBe("2022-06");
  expect(northwind.isCurrent).toBe(true);
  expect(northwind.location).toMatch(/Toronto/i);
  expect(northwind.achievements.some((bullet) => bullet.includes("35"))).toBe(true);
  expect(northwind.achievements.some((bullet) => bullet.includes("40"))).toBe(true);

  expect(brightpath.company).toBe("Brightpath Studio");
  expect(brightpath.title).toBe("Full Stack Developer");
  expect(brightpath.startDate).toBe("2021-01");
  expect(brightpath.endDate).toBe("2022-05");
  expect(brightpath.location).toMatch(/Remote/i);

  expect(harbor.company).toBe("Bank of Harbor");
  expect(harbor.title).toBe("Software Developer");
  expect(harbor.startDate).toBe("2019-08");
  expect(harbor.endDate).toBe("2020-12");
  expect(harbor.location).toBe("Ottawa");

  expect(lumen.company).toBe("Lumen Cohort");
  expect(lumen.title).toBe("Full Stack Developer");
  expect(lumen.startDate).toBe("2018-03");
  expect(lumen.endDate).toBe("2019-07");
  expect(lumen.location).toMatch(/Lagos/i);

  expect(parsed.education).toHaveLength(2);
  expect(parsed.education[0]).toMatchObject({
    institution: "Harbourview Polytechnic",
    qualification: "B.Eng",
    fieldOfStudy: "Mechanical Engineering",
  });
  expect(parsed.education[1].institution).toBe("Northline Academy");
  expect(parsed.education[1].qualification).toMatch(/Certificate in Full Stack Web Development/i);

  expect(parsed.certifications).toHaveLength(1);
  expect(parsed.certifications[0].name).toMatch(/AWS Certified Cloud Practitioner/i);
  expect(parsed.certifications[0].credentialId).toBe("NW-CLOUD-2048");
  expect(parsed.certifications[0].issuer).toBe("Amazon Web Services");
  expect(parsed.certifications[0].credentialUrl).toBe(CREDENTIAL_URL);

  const skills = parsed.skillGroups.flatMap((group) => group.skills);
  for (const name of [
    "React",
    "TypeScript",
    "GraphQL",
    "Express",
    "Turborepo",
    "Storybook",
    "Figma",
    "Playwright",
    "Sentry",
    "Splunk",
    "pnpm",
    "CI/CD",
    "WCAG",
  ]) {
    expect(skills).toContain(name);
  }
  for (const heading of [
    "Frontend",
    "Cloud & Backend",
    "Engineering Practices",
    "Design Systems",
    "UI/UX & Design",
    "Testing",
    "Integration and Data",
    "CSS3Responsive",
    "pipelinesTurborepo",
    "StorybookFigma",
    "GraphQLAuthentication",
  ]) {
    expect(skills.map((skill) => skill.toLowerCase())).not.toContain(heading.toLowerCase());
  }
  expect(skills.every((skill) => skill.split(/\s+/).length <= 8)).toBe(true);

  const scores = parsed.skillGroups.flatMap((group) => group.skillConfidence ?? []);
  expect(scores.length).toBe(skills.length);
  expect(scores.every((score) => score < 1)).toBe(true);
  expect(scores).toContain(0.9);
  expect(scores.some((score) => score < 0.9)).toBe(true);
  expect(parsed.fieldProvenance?.length).toBeGreaterThan(0);
  expect(parsed.warnings.some((warning) => warning.code === "heuristic_fallback")).toBe(true);
}

describe("anonymised resume golden fixture", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    createMock.mockReset();
    createMock.mockRejectedValue(new Error("OpenAI should not be called"));
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it("parses the rules-only text path", async () => {
    expect(ANONYMISED_RESUME_TEXT).toContain("Northwind\u2060 Labs");
    const normalized = normalizeExtractedDocument(
      extractTextDocument(Buffer.from(ANONYMISED_RESUME_TEXT))
    );
    expect(normalized.normalizedText).not.toContain("\u2060");
    expect(normalized.normalizedText).toContain("Northwind Labs");
    expect(normalized.normalizedText).toContain("CSS3 Responsive");
    expect(normalized.normalizedText).toContain("GraphQL Authentication");
    expect(normalized.normalizedText).not.toContain("CSS3Responsive");

    const result = await parseResumeStructure(normalized);
    expect(result.usedHeuristicOnly).toBe(true);
    expect(result.model).toBeNull();
    expect(result.fallbackReason).toBe("no_key");
    expectGoldenResume(result.parsed);
  });

  it("keeps layout, columns, orphan bullets, and link annotations from pdfjs", async () => {
    const buffer = await buildAnonymisedResumePdf();
    const previous = process.env.VERCEL;
    delete process.env.VERCEL;
    try {
      const extracted = await extractPdfDocument(buffer);
      expect(extracted.warnings.some((warning) => warning.code === "reading_order_uncertain")).toBe(false);
      expect(extracted.pages[0].items.some((item) => typeof item.x === "number" && typeof item.y === "number")).toBe(true);
      const urls = (extracted.links ?? []).map((link) => link.url);
      expect(urls).toContain("mailto:jordan.hale@example.com");
      expect(urls).toContain("https://www.linkedin.com/in/jordan-hale");
      expect(urls).toContain("https://github.com/jordan-hale-dev");

      expect(extracted.pages.length).toBeGreaterThanOrEqual(3);
      const rawKey = extracted.pages.flatMap((page) => page.items).filter((item) => item.text === "Key Contributions");
      expect(rawKey.length).toBeGreaterThanOrEqual(4);
      const normalized = normalizeExtractedDocument(extracted);
      expect(normalized.lines.filter((line) => line.text === "Software Developer")).toHaveLength(2);
      expect(normalized.lines.filter((line) => line.text === "Key Contributions")).toHaveLength(1);
      for (const removed of ["of", "Developer", "Full Stack", "•", "1", "2", "3"]) {
        expect(normalized.lines.some((line) => line.text.trim() === removed)).toBe(false);
      }
      expect(normalized.normalizedText).toContain("Bank of Harbor");
      expect(normalized.lines.some((line) => line.text.trim() === "•")).toBe(false);
      expect(normalized.lines.some((line) => line.text.startsWith("• "))).toBe(true);
      expect(normalized.lines.map((line) => line.text)).toContain("01/2021 - 05/2022");
      expect(normalized.lines.map((line) => line.text)).toContain("Full Stack Developer");
      expect(normalized.lines.some((line) => /01\/2021 - 05\/2022\s+Full Stack Developer/.test(line.text))).toBe(false);
      expect(normalized.normalizedText).toContain("CSS3 Responsive");
      expect(normalized.normalizedText).not.toContain("StorybookFigma");

      const result = await parseResumeStructure(normalized);
      expectGoldenResume(result.parsed);
      expect(result.parsed.contact.linkedInUrl).toBe("https://www.linkedin.com/in/jordan-hale");
      expect(result.parsed.contact.githubUrl).toBe("https://github.com/jordan-hale-dev");
      expect(result.parsed.contact.portfolioUrl).toBe(PORTFOLIO_URL);
      expect(result.parsed.contact.otherLinks.map((link) => link.url)).not.toContain(COMPANY_URL);
      expect(result.parsed.experience[0].companyUrl).toBe(COMPANY_URL);
      const uncited = result.parsed.warnings.filter((warning) => warning.code === "uncited_fact");
      for (const field of [
        "contact.linkedInUrl",
        "contact.githubUrl",
        "contact.portfolioUrl",
        "contact.email",
        "certifications.0.credentialUrl",
        "experience.0.companyUrl",
      ]) {
        expect(uncited.some((warning) => warning.fieldPath === field)).toBe(false);
      }
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });

  it("keeps achievements when bullet glyphs are inline with the text", async () => {
    const buffer = await buildAnonymisedResumePdf({ inlineGlyphs: true });
    const extracted = await extractPdfDocument(buffer);
    expect(extracted.pages.length).toBeGreaterThanOrEqual(3);
    const tinyGlyphs = extracted.pages.flatMap((page) =>
      page.items.filter(
        (item) =>
          item.text === "•" &&
          typeof item.width === "number" &&
          item.width < 2 &&
          typeof item.fontSize === "number" &&
          item.fontSize < 3
      )
    );
    expect(tinyGlyphs.length).toBeGreaterThan(0);

    const result = await parseResumeStructure(normalizeExtractedDocument(extracted));
    expectGoldenResume(result.parsed);
    const achievements = result.parsed.experience.flatMap((role) => role.achievements);
    expect(achievements.length).toBe(23);
    for (const achievement of achievements) {
      expect(achievement).not.toMatch(/^[•●▪◦‣·–—]/);
    }
    expect(achievements.some((bullet) => bullet.includes("cut interface delivery time by 35 percent"))).toBe(
      true
    );
    expect(achievements.some((bullet) => bullet.includes("with MongoDB indexes"))).toBe(true);
  });

  it("still uses pdfjs when VERCEL=1", async () => {
    const buffer = await buildAnonymisedResumePdf();
    const previous = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const extracted = await extractPdfDocument(buffer);
      expect(extracted.pages[0].items.some((item) => typeof item.x === "number" && typeof item.y === "number")).toBe(true);
      expect(extracted.warnings.some((warning) => warning.code === "reading_order_uncertain")).toBe(false);
      const result = await parseResumeStructure(normalizeExtractedDocument(extracted));
      expectGoldenResume(result.parsed);
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });

  it("sends one strict schema call and drops facts that miss their source lines", async () => {
    process.env.OPENAI_API_KEY = "sk-test-golden-resume";
    const normalized = normalizeExtractedDocument(
      extractTextDocument(Buffer.from(ANONYMISED_RESUME_TEXT))
    );

    createMock.mockImplementation(async (body: {
      messages: Array<{ content: string }>;
      response_format: {
        type: string;
        json_schema: { strict: boolean; schema: { additionalProperties: boolean } };
      };
    }) => {
      const prompt = body.messages[1].content;
      const reactLine = prompt.split("\n").find((line) => /^\s*\d+\|/.test(line) && line.includes("React"));
      const nameLine = prompt.split("\n").find((line) => /^\s*\d+\|/.test(line) && line.includes("Jordan Hale"));
      if (!reactLine || !nameLine) {
        throw new Error(`Missing citation lines. React=${reactLine ?? "none"} Name=${nameLine ?? "none"}`);
      }
      const reactNo = Number(reactLine?.split("|")[0]);
      const nameNo = Number(nameLine?.split("|")[0]);
      const payload = {
        contact: {
          fullName: cited("Jordan Hale", [nameNo]),
          headline: cited("Senior Software Developer", [nameNo]),
          email: cited(null),
          phone: cited(null),
          location: cited(null),
          linkedInUrl: cited(null),
          githubUrl: cited(null),
          portfolioUrl: cited(null),
          otherLinks: [],
        },
        professionalSummary: cited(null),
        skillGroups: [
          {
            category: cited("Frontend", [reactNo]),
            skills: [
              { name: "React", sourceLines: [reactNo] },
              { name: "Invented Quantum Framework", sourceLines: [nameNo] },
            ],
          },
        ],
        experience: [],
        education: [],
        certifications: [],
        projects: [],
        warnings: [],
      };
      return {
        model: "gpt-4o-mini-2024-07-18",
        usage: { prompt_tokens: 3000, completion_tokens: 2500 },
        choices: [{ message: { content: JSON.stringify(payload) } }],
      };
    });

    try {
      const result = await parseResumeStructure(normalized);
      expect(createMock).toHaveBeenCalledTimes(1);
      const request = createMock.mock.calls[0][0];
      expect(request.response_format.type).toBe("json_schema");
      expect(request.response_format.json_schema.strict).toBe(true);
      expect(request.response_format.json_schema.name).toBe("parsed_resume");
      expect(request.temperature).toBe(0);
      expect(request.messages[1].content).toMatch(/(^|\n)1\| /);
      expect(request.messages[1].content).not.toContain("Deterministic pre-parse");
      expect(result.usedHeuristicOnly).toBe(false);
      expect(result.fallbackReason).toBeNull();
      expect(result.usedRepair).toBe(false);
      expect(result.model).toContain("gpt-4o-mini");
      expect(result.tokenUsage?.costUsd).toBeCloseTo(0.00195, 5);
      const skills = result.parsed.skillGroups.flatMap((group) => group.skills);
      expect(skills).toContain("React");
      expect(skills).not.toContain("Invented Quantum Framework");
      expect(result.parsed.warnings.some((warning) => warning.code === "source_mismatch")).toBe(true);
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("records the model error when the API call fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test-golden-resume";
    createMock.mockRejectedValue(new Error("schema rejected the payload"));
    const normalized = normalizeExtractedDocument(
      extractTextDocument(Buffer.from(ANONYMISED_RESUME_TEXT))
    );
    const result = await parseResumeStructure(normalized);
    expect(result.usedHeuristicOnly).toBe(true);
    expect(result.model).toBeNull();
    expect(result.fallbackReason).toContain("schema rejected the payload");
    expect(result.parsed.warnings.some((warning) => warning.code === "ai_parse_failed")).toBe(true);
  });

  it("builds a strict schema with no extra properties", () => {
    const schema = buildStrictParsedResumeJsonSchema();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("experience");
    const contact = schema.properties as { contact: { additionalProperties: boolean; properties: { fullName: { type: string[] } } } };
    expect(contact.contact.additionalProperties).toBe(false);
    expect(contact.contact.properties.fullName.type).toBe("object");
  });
});
