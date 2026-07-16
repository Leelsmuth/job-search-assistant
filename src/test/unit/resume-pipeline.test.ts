import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { repairHyphenation, splitConcatenatedDateTitle } from "@/modules/resumes/normalize/hyphenation-repair";
import { normalizeExtractedDocument } from "@/modules/resumes/normalize/extracted-document-normalizer";
import { extractTextDocument } from "@/modules/resumes/extract/text-resume-extractor";
import { detectResumeSections } from "@/modules/resumes/parse/resume-section-detector";
import {
  deterministicPreParse,
  preParseHintsToPartialResume,
} from "@/modules/resumes/parse/deterministic-pre-parser";
import { evaluateParsedResume } from "@/modules/resumes/eval/resume-parser-evaluator";

const fixturesDir = join(process.cwd(), "src/test/fixtures/resumes");

describe("resume normalization", () => {
  it("repairs hyphenated line breaks", () => {
    const input = "large-scale, high-\nperformance web applications";
    expect(repairHyphenation(input)).toBe(
      "large-scale, high-performance web applications"
    );
  });

  it("splits concatenated date and title", () => {
    const parts = splitConcatenatedDateTitle("06/2022 – presentSoftware Developer");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/06\/2022/i);
    expect(parts[1]).toBe("Software Developer");
  });

  it("merges wrapped Okta bullet in priceline-style fixture", () => {
    const text = readFileSync(join(fixturesDir, "priceline-style-redacted.txt"), "utf-8");
    const doc = extractTextDocument(Buffer.from(text));
    const normalized = normalizeExtractedDocument(doc);
    expect(normalized.normalizedText.toLowerCase()).toContain("okta-based system");
    expect(normalized.normalizedText).not.toMatch(/Okta-\n/);
  });
});

describe("resume section detection", () => {
  it("detects major sections in priceline-style fixture", () => {
    const text = readFileSync(join(fixturesDir, "priceline-style-redacted.txt"), "utf-8");
    const doc = extractTextDocument(Buffer.from(text));
    const normalized = normalizeExtractedDocument(doc);
    const sections = detectResumeSections(normalized.lines);
    const types = sections.map((s) => s.type);
    expect(types).toContain("summary");
    expect(types).toContain("skills");
    expect(types).toContain("experience");
    expect(types).toContain("education");
    expect(types).toContain("certifications");
  });
});

describe("deterministic pre-parser regression", () => {
  it("structures priceline-style resume without flat line bullets", () => {
    const text = readFileSync(join(fixturesDir, "priceline-style-redacted.txt"), "utf-8");
    const doc = extractTextDocument(Buffer.from(text));
    const normalized = normalizeExtractedDocument(doc);
    const sections = detectResumeSections(normalized.lines);
    const hints = deterministicPreParse(sections);
    const parsed = preParseHintsToPartialResume(hints);

    const evalResult = evaluateParsedResume("priceline-style-redacted", parsed, {
      summaryContains: ["Frontend-focused engineer"],
      skillCategories: ["Frontend"],
      skills: ["React", "Next.js"],
      companies: ["Priceline", "Myplanet", "CIBC", "Code Clan NG"],
      titles: ["Software Developer"],
      achievementsContain: ["Okta-based system"],
      achievementsMustNotContain: [
        "Work Experience",
        "Core Technical Skills",
        "github.com",
        "linkedin.com",
        "Career Objective",
      ],
      certifications: ["AWS Certified Cloud Practitioner"],
      educationInstitutions: ["University of Lagos"],
    });

    expect(parsed.professionalSummary?.toLowerCase()).toContain("frontend-focused");
    expect(parsed.skillGroups.some((g) => g.category?.toLowerCase() === "frontend")).toBe(true);
    expect(parsed.experience.some((e) => e.company?.includes("Priceline"))).toBe(true);

    const oktaAchievements = parsed.experience.flatMap((e) => e.achievements).filter((a) =>
      /okta/i.test(a)
    );
    expect(oktaAchievements).toHaveLength(1);
    expect(oktaAchievements[0]).toContain("Okta-based system");

    expect(evalResult.experienceEntryScore).toBeGreaterThan(0.5);
    expect(evalResult.achievementGroupingScore).toBeGreaterThan(0);

    expect(parsed.experience.filter((e) => e.company?.includes("Priceline"))).toHaveLength(1);
  });

  it("structures stacked company/title layout (PDF-style)", () => {
    const text = readFileSync(join(fixturesDir, "priceline-style-stacked.txt"), "utf-8");
    const doc = extractTextDocument(Buffer.from(text));
    const normalized = normalizeExtractedDocument(doc);
    const sections = detectResumeSections(normalized.lines);
    const parsed = preParseHintsToPartialResume(deterministicPreParse(sections));

    expect(parsed.experience).toHaveLength(4);

    const priceline = parsed.experience.find((e) => e.company?.includes("Priceline"));
    expect(priceline?.title).toMatch(/Software Developer/i);
    expect(priceline?.startDateText).toMatch(/Jun 2022/i);
    expect(priceline?.achievements.some((a) => /Okta/i.test(a))).toBe(true);

    const cibc = parsed.experience.find((e) =>
      e.company?.includes("Canadian Imperial Bank of Commerce")
    );
    expect(cibc?.title).toMatch(/Software Developer/i);
    expect(cibc?.startDateText).toMatch(/Nov 2020/i);

    const myplanet = parsed.experience.find((e) => e.company?.includes("Myplanet"));
    expect(myplanet?.title).toMatch(/Full Stack Developer/i);
  });

  it("structures vertical date/title/company layout with ISO dates", () => {
    const text = readFileSync(join(fixturesDir, "priceline-style-vertical.txt"), "utf-8");
    const doc = extractTextDocument(Buffer.from(text));
    const normalized = normalizeExtractedDocument(doc);
    const sections = detectResumeSections(normalized.lines);
    const parsed = preParseHintsToPartialResume(deterministicPreParse(sections));

    expect(parsed.experience).toHaveLength(4);

    const priceline = parsed.experience.find((e) => e.company === "Priceline");
    expect(priceline).toBeDefined();
    expect(priceline?.title).toBe("Software Developer");
    expect(priceline?.startDate).toBe("2022-06");
    expect(priceline?.endDate).toBeNull();
    expect(priceline?.isCurrent).toBe(true);
    expect(priceline?.achievements.length).toBeGreaterThan(0);
    expect(priceline?.achievements.some((a) => /Okta/i.test(a))).toBe(true);

    const myplanet = parsed.experience.find((e) => e.company === "Myplanet");
    expect(myplanet?.title).toBe("Full Stack Developer");
    expect(myplanet?.startDate).toBe("2021-10");
    expect(myplanet?.endDate).toBe("2022-06");
    expect(myplanet?.achievements.length).toBeGreaterThan(0);

    const cibc = parsed.experience.find(
      (e) => e.company === "Canadian Imperial Bank of Commerce"
    );
    expect(cibc?.title).toBe("Software Developer");
    expect(cibc?.startDate).toBe("2020-11");
    expect(cibc?.endDate).toBe("2021-10");

    const codeClan = parsed.experience.find((e) => e.company === "Code Clan NG");
    expect(codeClan?.title).toBe("Full Stack Developer");
    expect(codeClan?.startDate).toBe("2019-05");
    expect(codeClan?.endDate).toBe("2020-11");

    for (const exp of parsed.experience) {
      expect(exp.title).not.toMatch(/present/i);
      expect(exp.company).not.toMatch(/developer|engineer/i);
    }

    expect(parsed.experience.some((e) => e.title === "Priceline")).toBe(false);
    expect(parsed.experience.some((e) => e.title?.includes("Jun 2022"))).toBe(false);
  });
});
