export const NORMALIZATION_VERSION = "v1";

import type { ExtractedDocument } from "@/modules/resumes/extract/types";
import { removeRepeatedHeadersFooters } from "./header-footer-remover";
import {
  groupItemsIntoLines,
  mergeWrappedLines,
  type GroupedLine,
} from "./line-grouper";
import {
  normalizeLineText,
  repairHyphenation,
  splitConcatenatedDateTitle,
} from "./hyphenation-repair";
import { hashInput } from "@/lib/utils";
import { EXTRACTOR_VERSION } from "@/modules/resumes/extract/types";

export type NormalizedDocument = {
  lines: GroupedLine[];
  normalizedText: string;
  normalizationVersion: string;
  extractionHash: string;
};

function postProcessLine(line: GroupedLine): GroupedLine[] {
  const repaired = repairHyphenation(line.text);
  const normalized = normalizeLineText(repaired);
  const splits = splitConcatenatedDateTitle(normalized);

  if (splits.length === 1) {
    return [{ ...line, text: normalized }];
  }

  return splits.map((text, index) => ({
    ...line,
    text,
    items: index === 0 ? line.items : line.items.slice(-1),
  }));
}

export function normalizeExtractedDocument(doc: ExtractedDocument): NormalizedDocument {
  const flatItems = removeRepeatedHeadersFooters(doc.pages);
  const grouped = groupItemsIntoLines(flatItems);
  const merged = mergeWrappedLines(grouped);

  const lines = merged.flatMap(postProcessLine).filter((l) => l.text.length > 0);
  const normalizedText = lines.map((l) => l.text).join("\n");

  const extractionHash = hashInput(
    `${EXTRACTOR_VERSION}:${NORMALIZATION_VERSION}:${normalizedText}`
  );

  return {
    lines,
    normalizedText,
    normalizationVersion: NORMALIZATION_VERSION,
    extractionHash,
  };
}

export function computeParserVersion(promptVersion: string): string {
  return `${EXTRACTOR_VERSION}.${NORMALIZATION_VERSION}.${promptVersion}`;
}
