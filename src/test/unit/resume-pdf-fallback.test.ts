import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs", () => ({}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: () => {
    throw new Error("pdfjs unavailable in this test");
  },
  GlobalWorkerOptions: { workerSrc: "" },
}));

import { extractPdfDocument } from "@/modules/resumes/extract/pdf-text-extractor";
import { normalizeExtractedDocument } from "@/modules/resumes/normalize/extracted-document-normalizer";
import { parseResumeStructure } from "@/modules/resumes/parse/resume-structure-parser";
import { buildAnonymisedResumePdf } from "@/test/fixtures/resumes/anonymised-jordan-hale";

describe("pdf-parse last-resort fallback", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("uses flat text only after pdfjs throws", async () => {
    const buffer = await buildAnonymisedResumePdf();
    const extracted = await extractPdfDocument(buffer);

    expect(extracted.warnings.map((warning) => warning.code)).toContain("reading_order_uncertain");
    expect(
      extracted.pages.every((page) => page.items.every((item) => item.x === undefined && item.y === undefined))
    ).toBe(true);
    expect(extracted.rawText).toMatch(/Jordan Hale/);
    expect(extracted.rawText).toMatch(/Northwind Labs/);

    const result = await parseResumeStructure(normalizeExtractedDocument(extracted));
    expect(result.usedHeuristicOnly).toBe(true);
    expect(result.parsed.contact.fullName).toBe("Jordan Hale");
    expect(result.parsed.contact.headline).toBe("Senior Software Developer");
    expect(result.parsed.contact.headline).not.toMatch(/jordan-hale/i);
    expect(result.parsed.experience.map((role) => role.achievements.length)).toEqual([11, 4, 4, 4]);
    expect(result.parsed.education).toHaveLength(2);
    expect(result.parsed.certifications).toHaveLength(1);
    expect(result.parsed.certifications[0]?.credentialId).toBe("NW-CLOUD-2048");
  });
});
