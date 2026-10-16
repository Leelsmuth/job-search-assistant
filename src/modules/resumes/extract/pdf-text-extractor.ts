import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { stripZeroWidth } from "@/modules/resumes/normalize/text-cleanup";
import type {
  ExtractedDocument,
  ExtractedLink,
  ExtractedPage,
  ExtractedTextItem,
  ExtractionWarning,
} from "./types";
import { EXTRACTOR_VERSION } from "./types";

const PDFJS_WORKER_RELATIVE = join(
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.mjs"
);

const PDFJS_STANDARD_FONTS = join("node_modules", "pdfjs-dist", "standard_fonts") + "/";

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
};

type PdfAnnotation = {
  subtype?: string;
  url?: string;
  unsafeUrl?: string;
  rect?: number[];
};

let workerConfigured = false;

function resolveExistingPath(relativePath: string): string | null {
  const absolute = join(process.cwd(), relativePath);
  return existsSync(absolute) ? absolute : null;
}

async function configurePdfJsWorker(
  pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs")
): Promise<void> {
  if (workerConfigured && pdfjs.GlobalWorkerOptions.workerSrc) return;

  try {
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  } catch {
    // The in-process worker is optional. A file URL is the backup.
  }

  const workerPath = resolveExistingPath(PDFJS_WORKER_RELATIVE);
  if (workerPath) {
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  } else if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";
  }

  workerConfigured = true;
}

function cleanItemText(text: string): string {
  return stripZeroWidth(text).replace(/[ \t]+/g, " ").trim();
}

function annotationUrl(annotation: PdfAnnotation): string | null {
  const url = annotation.url || annotation.unsafeUrl;
  if (!url || url === "none") return null;
  return url.trim();
}

function isUsefulLink(url: string): boolean {
  return /^(mailto:|https?:)/i.test(url) || /linkedin\.com|github\.com/i.test(url);
}

async function extractWithPdfParse(buffer: Buffer): Promise<{
  rawText: string;
  warnings: ExtractionWarning[];
}> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return {
    rawText: stripZeroWidth(result.text ?? "").trim(),
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
    text: cleanItemText(text),
    page: 1,
    lineIndex: index,
  }));

  return {
    sourceType: "pdf",
    pages: [{ pageNumber: 1, items }],
    rawText,
    warnings,
    extractorVersion: EXTRACTOR_VERSION,
    pageCount,
    itemCount: items.length,
    links: [],
  };
}

async function extractWithPdfJs(buffer: Buffer): Promise<ExtractedDocument> {
  const warnings: ExtractionWarning[] = [];
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await configurePdfJsWorker(pdfjs);

  const standardFonts = resolveExistingPath(PDFJS_STANDARD_FONTS);
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    ...(standardFonts ? { standardFontDataUrl: pathToFileURL(standardFonts).href } : {}),
  });
  const pdf = await loadingTask.promise;

  if (pdf.numPages > 20) {
    warnings.push({
      code: "large_page_count",
      message: `PDF has ${pdf.numPages} pages; only the first 20 were processed.`,
    });
  }

  const pages: ExtractedPage[] = [];
  const links: ExtractedLink[] = [];
  const pageLimit = Math.min(pdf.numPages, 20);

  for (let pageNum = 1; pageNum <= pageLimit; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items: ExtractedTextItem[] = [];

    for (const raw of textContent.items) {
      if (!("str" in raw)) continue;
      const item = raw as PdfTextItem;
      const text = cleanItemText(item.str ?? "");
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

    const annotations = (await page.getAnnotations()) as PdfAnnotation[];
    for (const annotation of annotations) {
      if (annotation.subtype && annotation.subtype !== "Link") continue;
      const url = annotationUrl(annotation);
      if (!url || !isUsefulLink(url)) continue;
      const rect = annotation.rect ?? [];
      links.push({
        url,
        page: pageNum,
        x: rect[0],
        y: rect[1],
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
      message: "Could not extract enough text from PDF. The file may be image-only.",
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
    links,
  };
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function extractPdfDocument(buffer: Buffer): Promise<ExtractedDocument> {
  let pdfJsError: unknown = null;

  try {
    const laidOut = await extractWithPdfJs(buffer);
    if (laidOut.rawText.trim().length >= 50) return laidOut;
  } catch (error) {
    const message = failureMessage(error);
    if (/password|encrypt/i.test(message)) {
      throw new Error("PDF is encrypted. Please upload an unencrypted PDF or DOCX.");
    }
    pdfJsError = error;
  }

  try {
    const fallback = await extractWithPdfParse(buffer);
    if (fallback.rawText.length >= 50) {
      return flatTextToDocument(fallback.rawText, fallback.warnings);
    }
  } catch {
    // pdf-parse is only a last resort. Surface the original failure below.
  }

  const message = pdfJsError ? failureMessage(pdfJsError) : "no extractable text";
  if (/xref|invalid pdf|corrupt/i.test(message)) {
    throw new Error(
      "PDF parsing failed: file may be corrupted or scanned. Try DOCX or export a text-based PDF."
    );
  }

  throw new Error(`PDF parsing failed: ${message}`);
}

export async function extractPdfText(buffer: Buffer): Promise<ExtractedDocument> {
  return extractPdfDocument(buffer);
}
