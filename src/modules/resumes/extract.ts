export {
  extractResumeText,
  extractDocument,
  extractPdfDocument,
  extractPdfText,
  PARSER_VERSION,
  MAX_RESUME_BYTES,
  MIN_RESUME_TEXT_LENGTH,
} from "./extract/extract-document";

export { detectFileType } from "./ingestion/resume-file-validator";

export type { ExtractionResult } from "./extract/legacy-types";
