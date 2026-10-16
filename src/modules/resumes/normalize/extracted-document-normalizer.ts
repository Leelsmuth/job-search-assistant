export const NORMALIZATION_VERSION = "v3";

import type { ExtractedDocument, ExtractedLink } from "@/modules/resumes/extract/types";
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
  links: ExtractedLink[];
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
  lines.forEach((line, index) => {
    line.lineNumber = index + 1;
  });
  const normalizedText = lines.map((l) => l.text).join("\n");
  const links = doc.links ?? [];
  const linkKey = links.map((link) => link.url).join("|");

  const extractionHash = hashInput(
    `${EXTRACTOR_VERSION}:${NORMALIZATION_VERSION}:${normalizedText}:${linkKey}`
  );

  return {
    lines,
    normalizedText,
    normalizationVersion: NORMALIZATION_VERSION,
    extractionHash,
    links,
  };
}

export function toLineNumberedLayout(lines: GroupedLine[]): string {
  return lines
    .map((line, index) => `${line.lineNumber ?? index + 1}| ${line.text}`)
    .join("\n");
}

export function computeParserVersion(promptVersion: string): string {
  return `${EXTRACTOR_VERSION}.${NORMALIZATION_VERSION}.${promptVersion}`;
}
