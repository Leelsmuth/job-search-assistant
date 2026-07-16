import {
  EXTRACTOR_VERSION,
  type DetectedFileType,
  type ExtractionWarning,
  type ValidatedResumeFile,
} from "@/modules/resumes/extract/types";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MIN_RESUME_TEXT_LENGTH = 50;
export const MAX_PDF_PAGES = 20;

const MIME_TO_TYPE: Record<string, DetectedFileType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

export function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === "%PDF") {
    return "pdf";
  }
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return "docx";
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 512)).toString("utf-8");
  if (/[\x00-\x08\x0e-\x1f]/.test(sample)) return null;
  return "txt";
}

function extensionForType(type: DetectedFileType): string {
  if (type === "pdf") return ".pdf";
  if (type === "docx") return ".docx";
  return ".txt";
}

export function validateResumeFile(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): ValidatedResumeFile {
  const warnings: ExtractionWarning[] = [];

  if (buffer.length === 0) {
    throw new Error("File is empty.");
  }

  if (buffer.length > MAX_RESUME_BYTES) {
    throw new Error("File too large. Maximum size is 5 MB.");
  }

  const detectedType = detectFileType(buffer);
  if (!detectedType) {
    throw new Error(
      "Unsupported file type. Upload a PDF, DOCX, or plain-text resume."
    );
  }

  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  const expectedExt = extensionForType(detectedType);
  if (ext && ext !== expectedExt && ext !== ".text") {
    warnings.push({
      code: "reading_order_uncertain",
      message: `File extension (${ext}) does not match detected type (${detectedType}).`,
    });
  }

  const resolvedMime =
    mimeType && mimeType !== "application/octet-stream"
      ? mimeType
      : detectedType === "pdf"
        ? "application/pdf"
        : detectedType === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "text/plain";

  const mimeMapped = MIME_TO_TYPE[resolvedMime];
  if (mimeMapped && mimeMapped !== detectedType) {
    warnings.push({
      code: "reading_order_uncertain",
      message: `MIME type (${resolvedMime}) does not match detected content (${detectedType}).`,
    });
  }

  return {
    buffer,
    fileName,
    mimeType: resolvedMime,
    detectedType,
    warnings,
  };
}

export { EXTRACTOR_VERSION };
