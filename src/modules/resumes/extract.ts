import mammoth from "mammoth";

export const PARSER_VERSION = "v1";
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MIN_RESUME_TEXT_LENGTH = 50;

export type ExtractionResult = {
  text: string;
  parserVersion: string;
  fileType: string;
};

export type DetectedFileType = "pdf" | "docx" | "txt";

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

export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text?.trim() ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/xref|invalid pdf|corrupt/i.test(message)) {
      throw new Error(
        "PDF parsing failed: file may be corrupted or scanned. Try DOCX or export a text-based PDF."
      );
    }
    throw new Error(`PDF parsing failed: ${message}`);
  }
}

export async function extractResumeText(
  buffer: Buffer,
  fileTypeHint?: string
): Promise<ExtractionResult> {
  const detected = detectFileType(buffer);
  if (!detected) {
    throw new Error("Unsupported file type: could not detect PDF, DOCX, or plain text");
  }

  if (detected === "pdf") {
    const text = await extractPdfText(buffer);
    if (text.length < MIN_RESUME_TEXT_LENGTH) {
      throw new Error(
        "Could not extract enough text from PDF. The file may be image-only — try DOCX or TXT."
      );
    }
    return {
      text,
      parserVersion: PARSER_VERSION,
      fileType: "pdf",
    };
  }

  if (detected === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (text.length < MIN_RESUME_TEXT_LENGTH) {
      throw new Error("Could not extract enough text from DOCX. Try a different file.");
    }
    return {
      text,
      parserVersion: PARSER_VERSION,
      fileType: "docx",
    };
  }

  const text = buffer.toString("utf-8").trim();
  if (text.length < MIN_RESUME_TEXT_LENGTH) {
    throw new Error("Could not extract enough text from file.");
  }

  return {
    text,
    parserVersion: PARSER_VERSION,
    fileType: "txt",
  };
}
