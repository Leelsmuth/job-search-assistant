import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { TextBlock } from "@/modules/documents/types";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;

function pdfSafe(text: string): string {
  return text
    .replace(/[•●]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  const pushWord = (word: string) => {
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      return;
    }
    let rest = word;
    while (rest.length > 0) {
      let slice = rest;
      while (slice.length > 1 && font.widthOfTextAtSize(slice, size) > maxWidth) {
        slice = slice.slice(0, -1);
      }
      lines.push(slice);
      rest = rest.slice(slice.length);
    }
    current = "";
  };

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      pushWord(word);
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderBlocksPdf(blocks: TextBlock[], title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const drawLines = (
    lines: string[],
    face: PDFFont,
    size: number,
    leading: number,
    indent = 0
  ) => {
    for (const line of lines) {
      if (y < MARGIN + leading) newPage();
      page.drawText(line, {
        x: MARGIN + indent,
        y,
        size,
        font: face,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= leading;
    }
  };

  const drawBlock = (block: TextBlock) => {
    const text = pdfSafe(block.text);
    if (!text) return;
    if (block.kind === "section") y -= 8;
    const spec = {
      name: { face: bold, size: 16, leading: 20, indent: 0 },
      contact: { face: font, size: 10, leading: 14, indent: 0 },
      section: { face: bold, size: 12, leading: 16, indent: 0 },
      role: { face: bold, size: 11, leading: 14, indent: 0 },
      meta: { face: font, size: 10, leading: 13, indent: 0 },
      body: { face: font, size: 10.5, leading: 14, indent: 0 },
      bullet: { face: font, size: 10.5, leading: 14, indent: 12 },
    }[block.kind];
    const content = block.kind === "bullet" ? `- ${text}` : text;
    const lines = wrapLine(content, spec.face, spec.size, maxWidth - spec.indent);
    drawLines(lines, spec.face, spec.size, spec.leading, spec.indent);
    if (block.kind === "name" || block.kind === "section") y -= 2;
  };

  for (const block of blocks) drawBlock(block);
  return pdf.save();
}
