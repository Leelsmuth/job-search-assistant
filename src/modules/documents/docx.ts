import { Document, Packer, Paragraph, TextRun } from "docx";
import type { TextBlock } from "@/modules/documents/types";

function runs(block: TextBlock): TextRun[] {
  const text = block.kind === "bullet" ? block.text : block.text;
  const size = {
    name: 32,
    contact: 20,
    section: 24,
    role: 22,
    meta: 20,
    body: 21,
    bullet: 21,
  }[block.kind];
  const bold = block.kind === "name" || block.kind === "section" || block.kind === "role";
  return [new TextRun({ text, bold, size, font: "Calibri" })];
}

function spacing(kind: TextBlock["kind"]): { before: number; after: number } {
  if (kind === "name") return { before: 0, after: 80 };
  if (kind === "section") return { before: 240, after: 60 };
  if (kind === "bullet") return { before: 40, after: 40 };
  return { before: 40, after: 40 };
}

export async function renderBlocksDocx(blocks: TextBlock[], title: string): Promise<Uint8Array> {
  const doc = new Document({
    title,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 21 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: blocks.map(
          (block) =>
            new Paragraph({
              spacing: spacing(block.kind),
              children: runs(block.kind === "bullet" ? { ...block, text: `- ${block.text}` } : block),
            })
        ),
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
