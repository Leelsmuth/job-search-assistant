export const EXTRACTOR_VERSION = "v2";

export type ExtractionWarningCode =
  | "encrypted_pdf"
  | "corrupt_file"
  | "image_only_pdf"
  | "low_text_density"
  | "large_page_count"
  | "ocr_required"
  | "docx_flattened"
  | "reading_order_uncertain";

export type ExtractionWarning = {
  code: ExtractionWarningCode;
  message: string;
};

export type ExtractedTextItem = {
  text: string;
  page: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  lineIndex?: number;
};

export type ExtractedPage = {
  pageNumber: number;
  items: ExtractedTextItem[];
  width?: number;
  height?: number;
};

export type ExtractedDocument = {
  sourceType: "pdf" | "docx" | "text";
  pages: ExtractedPage[];
  rawText: string;
  warnings: ExtractionWarning[];
  extractorVersion: string;
  pageCount: number;
  itemCount: number;
};

export type DetectedFileType = "pdf" | "docx" | "txt";

export type ValidatedResumeFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  detectedType: DetectedFileType;
  warnings: ExtractionWarning[];
};
