import mammoth from "mammoth";
import type { ExtractedDocument, ExtractedPage, ExtractedTextItem, ExtractionWarning } from "./types";
import { EXTRACTOR_VERSION } from "./types";

type DocxBlock = {
  text: string;
  isHeading: boolean;
  isListItem: boolean;
  listLevel?: number;
};

async function extractDocxBlocks(buffer: Buffer): Promise<DocxBlock[]> {
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;
  const blocks: DocxBlock[] = [];

  const blockRegex = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    blocks.push({
      text,
      isHeading: tag.startsWith("h"),
      isListItem: tag === "li",
      listLevel: tag === "li" ? 1 : undefined,
    });
  }

  if (blocks.length === 0) {
    const raw = await mammoth.extractRawText({ buffer });
    return raw.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ text, isHeading: false, isListItem: false }));
  }

  return blocks;
}

export async function extractDocxDocument(buffer: Buffer): Promise<ExtractedDocument> {
  const warnings: ExtractionWarning[] = [];
  const blocks = await extractDocxBlocks(buffer);
  const items: ExtractedTextItem[] = blocks.map((block, index) => ({
    text: block.isListItem ? `- ${block.text}` : block.text,
    page: 1,
    lineIndex: index,
    fontSize: block.isHeading ? 14 : 11,
  }));

  const pages: ExtractedPage[] = [{ pageNumber: 1, items }];
  const rawText = items.map((i) => i.text).join("\n").trim();

  if (items.length > 0 && !blocks.some((b) => b.isListItem || b.isHeading)) {
    warnings.push({
      code: "docx_flattened",
      message: "DOCX structure was partially flattened; list and heading semantics may be limited.",
    });
  }

  return {
    sourceType: "docx",
    pages,
    rawText,
    warnings,
    extractorVersion: EXTRACTOR_VERSION,
    pageCount: 1,
    itemCount: items.length,
  };
}
