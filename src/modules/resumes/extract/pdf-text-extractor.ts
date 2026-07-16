import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import type { ExtractedDocument, ExtractedPage, ExtractedTextItem, ExtractionWarning } from "./types";
import { EXTRACTOR_VERSION } from "./types";

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
};

let workerConfigured = false;

async function configurePdfJsWorker(
  pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs")
): Promise<void> {
  if (workerConfigured && pdfjs.GlobalWorkerOptions.workerSrc) return;

  let workerPath: string;
  try {
    const require = createRequire(import.meta.url);
    workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  } catch {
    workerPath = join(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
    );
  }

  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  workerConfigured = true;
}

async function extractWithPdfParse(buffer: Buffer): Promise<{
  rawText: string;
  warnings: ExtractionWarning[];
}> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return {
    rawText: result.text?.trim() ?? "",
    warnings: [
      {
        code: "reading_order_uncertain",
        message:
          "PDF layout extraction unavailable; used plain-text fallback. Reading order may differ from the original.",
      },
    ],
  };
}

function flatTextToDocument(
  rawText: string,
  warnings: ExtractionWarning[],
  pageCount = 1
): ExtractedDocument {
  const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const items: ExtractedTextItem[] = lines.map((text, index) => ({
    text: text.trim(),
    page: 1,
    lineIndex: index,
  }));

  const pages: ExtractedPage[] = [{ pageNumber: 1, items }];

  return {
    sourceType: "pdf",
    pages,
    rawText,
    warnings,
    extractorVersion: EXTRACTOR_VERSION,
    pageCount,
    itemCount: items.length,
  };
}

async function extractWithPdfJs(buffer: Buffer): Promise<ExtractedDocument> {
  const warnings: ExtractionWarning[] = [];
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await configurePdfJsWorker(pdfjs);

  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const pdf = await loadingTask.promise;

  if (pdf.numPages > 20) {
    warnings.push({
      code: "large_page_count",
      message: `PDF has ${pdf.numPages} pages; only the first 20 were processed.`,
    });
  }

  const pages: ExtractedPage[] = [];
  const pageLimit = Math.min(pdf.numPages, 20);

  for (let pageNum = 1; pageNum <= pageLimit; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items: ExtractedTextItem[] = [];

    for (const raw of textContent.items) {
      if (!("str" in raw)) continue;
      const item = raw as PdfTextItem;
      const text = item.str?.trim();
      if (!text) continue;

      const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
      const fontSize = Math.max(Math.abs(transform[0]), Math.abs(transform[3]));

      items.push({
        text,
        page: pageNum,
        x: transform[4],
        y: transform[5],
        width: item.width,
        height: item.height,
        fontSize,
      });
    }

    pages.push({
      pageNumber: pageNum,
      items,
      width: viewport.width,
      height: viewport.height,
    });
  }

  const rawText = pages
    .flatMap((p) => p.items.map((i) => i.text))
    .join("\n")
    .trim();

  if (rawText.length < 50) {
    warnings.push({
      code: "image_only_pdf",
      message:
        "Could not extract enough text from PDF. The file may be image-only.",
    });
  }

  const itemCount = pages.reduce((n, p) => n + p.items.length, 0);

  return {
    sourceType: "pdf",
    pages,
    rawText,
    warnings,
    extractorVersion: EXTRACTOR_VERSION,
    pageCount: pdf.numPages,
    itemCount,
  };
}

export async function extractPdfDocument(buffer: Buffer): Promise<ExtractedDocument> {
  try {
    return await extractWithPdfJs(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/password|encrypt/i.test(message)) {
      throw new Error("PDF is encrypted. Please upload an unencrypted PDF or DOCX.");
    }

    const isWorkerOrBundleError =
      /worker|fake worker|Cannot find module/i.test(message);

    if (isWorkerOrBundleError || /xref|invalid pdf|corrupt/i.test(message)) {
      try {
        const fallback = await extractWithPdfParse(buffer);
        if (fallback.rawText.length >= 50) {
          return flatTextToDocument(fallback.rawText, fallback.warnings);
        }
      } catch {
        // fall through to error below
      }
    }

    if (/xref|invalid pdf|corrupt/i.test(message)) {
      throw new Error(
        "PDF parsing failed: file may be corrupted or scanned. Try DOCX or export a text-based PDF."
      );
    }

    throw new Error(`PDF parsing failed: ${message}`);
  }
}

// Legacy alias — returns layout-aware document; use `.rawText` for plain string.
export async function extractPdfText(buffer: Buffer): Promise<ExtractedDocument> {
  return extractPdfDocument(buffer);
}
