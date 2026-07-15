import { describe, it, expect } from "vitest";
import {
  detectFileType,
  MAX_RESUME_BYTES,
  MIN_RESUME_TEXT_LENGTH,
} from "@/modules/resumes/extract";

describe("resume extract limits", () => {
  it("detects PDF magic bytes", () => {
    expect(detectFileType(Buffer.from("%PDF-1.4"))).toBe("pdf");
  });

  it("detects DOCX zip header", () => {
    const buf = Buffer.alloc(4);
    buf[0] = 0x50;
    buf[1] = 0x4b;
    expect(detectFileType(buf)).toBe("docx");
  });

  it("detects plain text", () => {
    expect(detectFileType(Buffer.from("Hello resume text"))).toBe("txt");
  });

  it("rejects binary without known signature", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    expect(detectFileType(buf)).toBeNull();
  });

  it("exports sensible size limits", () => {
    expect(MAX_RESUME_BYTES).toBe(5 * 1024 * 1024);
    expect(MIN_RESUME_TEXT_LENGTH).toBeGreaterThanOrEqual(50);
  });
});
