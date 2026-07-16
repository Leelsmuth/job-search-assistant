import type { ExtractedDocument, ExtractedPage, ExtractedTextItem } from "./types";
import { EXTRACTOR_VERSION } from "./types";

export function extractTextDocument(buffer: Buffer): ExtractedDocument {
  const rawText = buffer.toString("utf-8").trim();
  const lines = rawText.split(/\r?\n/);
  const items: ExtractedTextItem[] = lines.map((line, index) => ({
    text: line.trim(),
    page: 1,
    lineIndex: index,
  })).filter((i) => i.text.length > 0);

  const pages: ExtractedPage[] = [{ pageNumber: 1, items }];

  return {
    sourceType: "text",
    pages,
    rawText,
    warnings: [],
    extractorVersion: EXTRACTOR_VERSION,
    pageCount: 1,
    itemCount: items.length,
  };
}
