import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderBlocksDocx } from "@/modules/documents/docx";
import { renderBlocksPdf } from "@/modules/documents/pdf";
import { resumeBlocks } from "@/modules/documents/render-resume";
import type { ResolvedResume } from "@/modules/documents/types";

const resume: ResolvedResume = {
  header: {
    name: "Ada Lovelace",
    location: "Toronto",
    headline: "Frontend Engineer",
    yearsExperience: 8,
  },
  summary: "Builds accessible React interfaces.",
  experiences: [
    {
      company: "Acme",
      title: "Frontend Engineer",
      startDate: "2021",
      endDate: "2024",
      location: "Toronto",
      bullets: ["Built React dashboards with TypeScript"],
    },
  ],
  projects: [],
  skills: ["React", "TypeScript"],
  education: [],
  certifications: [],
};

function extractPdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  let text = "";
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const data = Buffer.from(match[1].replace(/\r?\n$/, ""), "latin1");
    let decoded: Buffer = data;
    try {
      decoded = inflateSync(data);
    } catch {
      decoded = data;
    }
    const source = decoded.toString("latin1");
    for (const hex of source.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      text += Buffer.from(hex[1], "hex").toString("latin1");
    }
    for (const literal of source.matchAll(/\((?:\\\)|\\.|[^)])*\)/g)) {
      text += literal[0].slice(1, -1);
    }
  }
  return text;
}

describe("resume pdf", () => {
  it("writes a selectable single-column PDF", async () => {
    const bytes = await renderBlocksPdf(resumeBlocks(resume), "Ada Lovelace resume");
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    const text = extractPdfText(bytes);
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Built React dashboards with TypeScript");
    expect(text).not.toContain("/Columns");
  });

  it("writes a docx zip", async () => {
    const bytes = await renderBlocksDocx(resumeBlocks(resume), "Ada Lovelace resume");
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe("PK");
  });
});
