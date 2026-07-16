export function repairHyphenation(text: string): string {
  return text.replace(/(\w)-\s*\n\s*(\w)/g, "$1-$2");
}

export function normalizeUnicode(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\ufb01/g, "fi")
    .replace(/\ufb02/g, "fl");
}

export function collapseWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, " ").trim();
}

export function splitConcatenatedDateTitle(line: string): string[] {
  const match = line.match(
    /^(\d{1,2}\/\d{4}\s*[-–—]\s*(?:present|\d{1,2}\/\d{4}))(.+)$/i
  );
  if (match) return [match[1].trim(), match[2].trim()];
  const match2 = line.match(
    /^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-–—]\s*(?:Present|\d{4}))(.+)$/i
  );
  if (match2) return [match2[1].trim(), match2[2].trim()];
  return [line];
}

export function normalizeLineText(line: string): string {
  return collapseWhitespace(normalizeUnicode(line));
}
