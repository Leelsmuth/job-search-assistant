import type { DetectedFileType, ExtractedDocument } from "./types";
import { extractPdfDocument } from "./pdf-text-extractor";
import { extractDocxDocument } from "./docx-text-extractor";
import { extractTextDocument } from "./text-resume-extractor";
import { MIN_RESUME_TEXT_LENGTH } from "@/modules/resumes/ingestion/resume-file-validator";

export async function extractDocument(
  buffer: Buffer,
  detectedType: DetectedFileType
): Promise<ExtractedDocument> {
  let doc: ExtractedDocument;

  if (detectedType === "pdf") {
    doc = await extractPdfDocument(buffer);
  } else if (detectedType === "docx") {
    doc = await extractDocxDocument(buffer);
  } else {
    doc = extractTextDocument(buffer);
  }

  if (doc.rawText.trim().length < MIN_RESUME_TEXT_LENGTH) {
    throw new Error(
      "Could not extract enough text from resume. The file may be image-only or empty."
    );
  }

  return doc;
}

// Backward-compatible flat text extraction for legacy callers
export async function extractResumeText(
  buffer: Buffer,
  fileTypeHint?: string
): Promise<{ text: string; parserVersion: string; fileType: string }> {
  void fileTypeHint;
  const { detectFileType } = await import("@/modules/resumes/ingestion/resume-file-validator");
  const type = detectFileType(buffer);
  if (!type) throw new Error("Unsupported file type");
  const doc = await extractDocument(buffer, type);
  return {
    text: doc.rawText,
    parserVersion: doc.extractorVersion,
    fileType: doc.sourceType === "text" ? "txt" : doc.sourceType,
  };
}

export { extractPdfDocument, extractPdfDocument as extractPdfText } from "./pdf-text-extractor";

export const PARSER_VERSION = "v2";
export { MAX_RESUME_BYTES, MIN_RESUME_TEXT_LENGTH } from "@/modules/resumes/ingestion/resume-file-validator";
