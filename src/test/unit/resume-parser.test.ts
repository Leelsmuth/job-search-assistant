import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  extractResumeText,
  extractPdfText,
  PARSER_VERSION,
  MIN_RESUME_TEXT_LENGTH,
} from "@/modules/resumes/extract";

const fixturesDir = join(process.cwd(), "src/test/fixtures");

describe("resume parser spike", () => {
  it("extracts text from plain text resume fixture", async () => {
    const text = readFileSync(join(fixturesDir, "sample-resume.txt"), "utf-8");
    const buffer = Buffer.from(text, "utf-8");
    const result = await extractResumeText(buffer, "text/plain");

    expect(result.parserVersion).toBe(PARSER_VERSION);
    expect(result.text).toContain("React");
    expect(result.text).toContain("Playwright");
    expect(result.text).toContain("TypeScript");
    expect(result.text.length).toBeGreaterThan(200);
  });

  it("extracts text from text-based PDF fixture", async () => {
    const buffer = readFileSync(join(fixturesDir, "sample-resume-text.pdf"));
    const result = await extractResumeText(buffer, "application/pdf");

    expect(result.fileType).toBe("pdf");
    expect(result.text.toLowerCase()).toContain("react");
    expect(result.text.toLowerCase()).toContain("playwright");
    expect(result.text.length).toBeGreaterThanOrEqual(MIN_RESUME_TEXT_LENGTH);
  });

  it("throws a clear error for corrupt PDF fixture", async () => {
    const buffer = readFileSync(join(fixturesDir, "sample-resume-corrupt.pdf"));
    await expect(extractPdfText(buffer)).rejects.toThrow(/PDF parsing failed/i);
  });

  it("throws a clear error when PDF parsing fails", async () => {
    await expect(
      extractPdfText(Buffer.from("%PDF-1.4\n%bad"))
    ).rejects.toThrow(/PDF parsing failed/i);
  });

  it("rejects unsupported file types", async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
    await expect(extractResumeText(buffer, "image/png")).rejects.toThrow(
      "Unsupported file type"
    );
  });
});
