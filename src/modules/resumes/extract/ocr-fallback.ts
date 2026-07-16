/**
 * OCR fallback placeholder — Phase 4.
 * When PDF text density is below threshold, mark for OCR and return low-confidence warning.
 */
import type { ExtractionWarning } from "@/modules/resumes/extract/types";

export function shouldAttemptOcr(textLength: number, pageCount: number): boolean {
  const density = textLength / Math.max(pageCount, 1);
  return textLength < 50 || density < 30;
}

export function ocrRequiredWarning(): ExtractionWarning {
  return {
    code: "ocr_required",
    message:
      "This appears to be an image-only PDF. OCR parsing is not yet enabled; try DOCX or a text-based PDF.",
  };
}
