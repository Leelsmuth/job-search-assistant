import type { ExtractedTextItem } from "@/modules/resumes/extract/types";

const Y_TOLERANCE = 3;
const COLUMN_GAP = 36;
const WORD_GAP = 1.25;

const ORPHAN_BULLET = /^[•●◦∙·▪‣]\s*$/;
const ROLE_HEADING = /^(key contributions|highlights|selected achievements|responsibilities)$/i;
const DATE_LINE =
  /^(?:\d{1,2}\/\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4})\b/i;
const SECTION_LINE =
  /^(professional summary|core technical skills|technical skills|work experience|professional experience|education|certifications|projects)\b/i;

export type GroupedLine = {
  text: string;
  page: number;
  items: ExtractedTextItem[];
  fontSize?: number;
  isBullet: boolean;
  lineNumber?: number;
};

function isBulletText(text: string): boolean {
  return /^[-•*–—●]\s+/.test(text.trim()) || ORPHAN_BULLET.test(text.trim());
}

function itemEnd(item: ExtractedTextItem): number {
  const width = item.width ?? Math.max(1, item.text.length) * (item.fontSize ?? 8) * 0.45;
  return (item.x ?? 0) + width;
}

function isColumnSpacer(item: ExtractedTextItem): boolean {
  return /^\s*$/.test(item.text) && (item.width ?? 0) >= COLUMN_GAP;
}

function joinCluster(items: ExtractedTextItem[]): string {
  let text = "";
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (isColumnSpacer(item)) continue;
    if (!text) {
      text = item.text;
      continue;
    }
    const previous = items[index - 1];
    const gap = (item.x ?? 0) - itemEnd(previous);
    const needsSpace = gap > WORD_GAP || /^\s/.test(item.text) || /\s$/.test(text);
    text += `${needsSpace && !/\s$/.test(text) && !/^\s/.test(item.text) ? " " : ""}${item.text}`;
  }
  return text.replace(/[ \t]+/g, " ").trim();
}

function clusterRow(items: ExtractedTextItem[]): ExtractedTextItem[][] {
  const sorted = [...items].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  const clusters: ExtractedTextItem[][] = [];
  let current: ExtractedTextItem[] = [];

  for (const item of sorted) {
    if (isColumnSpacer(item)) {
      if (current.length > 0) clusters.push(current);
      current = [];
      continue;
    }
    if (current.length === 0) {
      current.push(item);
      continue;
    }
    const previous = current[current.length - 1];
    const gap = (item.x ?? 0) - itemEnd(previous);
    if (gap > COLUMN_GAP) {
      clusters.push(current);
      current = [item];
      continue;
    }
    current.push(item);
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

function lineFromItems(items: ExtractedTextItem[], text: string): GroupedLine {
  return {
    text,
    page: items[0]?.page ?? 1,
    items,
    fontSize: items.reduce((max, item) => Math.max(max, item.fontSize ?? 0), 0) || undefined,
    isBullet: isBulletText(text),
  };
}

function contentIndent(line: GroupedLine): number | null {
  const xs = line.items
    .filter((item) => !ORPHAN_BULLET.test(item.text.trim()) && typeof item.x === "number")
    .map((item) => item.x as number);
  if (xs.length === 0) return null;
  return Math.min(...xs);
}

function sameIndent(left: GroupedLine, right: GroupedLine): boolean {
  const a = contentIndent(left);
  const b = contentIndent(right);
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= 4;
}

function canOwnBullet(textLine: GroupedLine, bulletLine: GroupedLine): boolean {
  const trimmed = textLine.text.trim();
  if (trimmed.length < 8 || ORPHAN_BULLET.test(trimmed)) return false;
  if (ROLE_HEADING.test(trimmed) || SECTION_LINE.test(trimmed) || DATE_LINE.test(trimmed)) return false;
  if (textLine.page !== bulletLine.page) return false;
  const bulletX = contentIndent(bulletLine);
  const textX = contentIndent(textLine);
  if (bulletX === null || textX === null) return trimmed.length >= 12;
  const dx = textX - bulletX;
  return dx >= -2 && dx <= 30;
}

function markBullet(textLine: GroupedLine, bulletLine: GroupedLine, glyphFirst: boolean) {
  textLine.isBullet = true;
  if (!/^[-•*–—●]\s+/.test(textLine.text.trim())) {
    textLine.text = `• ${textLine.text.trim()}`;
  }
  textLine.items = glyphFirst
    ? [...bulletLine.items, ...textLine.items]
    : [...textLine.items, ...bulletLine.items];
}

export function attachOrphanBullets(lines: GroupedLine[]): GroupedLine[] {
  const result: GroupedLine[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!ORPHAN_BULLET.test(line.text.trim())) {
      result.push(line);
      continue;
    }

    // This resume's extractor emits the glyph after the text line.
    const previous = result.at(-1);
    if (previous && canOwnBullet(previous, line)) {
      markBullet(previous, line, false);
      continue;
    }

    const next = lines[index + 1];
    if (next && canOwnBullet(next, line)) {
      markBullet(next, line, true);
    }
  }

  return result;
}

export function groupItemsIntoLines(items: ExtractedTextItem[]): GroupedLine[] {
  if (items.length === 0) return [];

  const hasCoords = items.some((item) => item.y !== undefined && item.x !== undefined);
  if (!hasCoords) {
    return attachOrphanBullets(
      items.map((item) => ({
        text: item.text,
        page: item.page,
        items: [item],
        fontSize: item.fontSize,
        isBullet: isBulletText(item.text),
      }))
    );
  }

  const sorted = [...items].sort((a, b) => {
    const pageDiff = a.page - b.page;
    if (pageDiff !== 0) return pageDiff;
    const yDiff = (b.y ?? 0) - (a.y ?? 0);
    if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
    return (a.x ?? 0) - (b.x ?? 0);
  });

  const rows: ExtractedTextItem[][] = [];
  let currentRow: ExtractedTextItem[] = [];
  let lastY: number | undefined;
  let lastPage: number | undefined;

  for (const item of sorted) {
    const y = item.y ?? 0;
    const sameRow =
      currentRow.length > 0 &&
      lastPage === item.page &&
      lastY !== undefined &&
      Math.abs(y - lastY) <= Y_TOLERANCE;

    if (sameRow) {
      currentRow.push(item);
      continue;
    }

    if (currentRow.length > 0) rows.push(currentRow);
    currentRow = [item];
    lastY = y;
    lastPage = item.page;
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const lines = rows.flatMap((row) =>
    clusterRow(row)
      .map((cluster) => lineFromItems(cluster, joinCluster(cluster)))
      .filter((line) => line.text.length > 0)
  );

  return attachOrphanBullets(lines);
}

function isHandleOrContact(text: string): boolean {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(text) ||
    /@/.test(text) ||
    /^(?:https?:|mailto:)/i.test(text) ||
    /^(?:\d{4}|\d{1,2}\/\d{4})(?:\s*[-–—]\s*(?:present|current|\d{4}|\d{1,2}\/\d{4}))?$/i.test(text)
  );
}

function isBulletWrap(line: GroupedLine, next: GroupedLine): boolean {
  if (!line.isBullet || next.isBullet || line.page !== next.page) return false;
  const nextText = next.text.trim();
  if (!nextText || ROLE_HEADING.test(nextText) || SECTION_LINE.test(nextText) || DATE_LINE.test(nextText)) {
    return false;
  }
  if (isHandleOrContact(nextText)) return false;
  return sameIndent(line, next);
}

function joinText(left: string, right: string, hyphen: boolean): string {
  if (hyphen) return `${left.trim()}${right.trim()}`;
  return `${left.trim()} ${right.trim()}`.replace(/[ \t]+/g, " ");
}

export function mergeWrappedLines(lines: GroupedLine[]): GroupedLine[] {
  const merged: GroupedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      const trimmed = line.text.trim();
      const nextText = next.text.trim();
      const hyphen = /\w-$/.test(trimmed) && next.page === line.page;
      const lowercaseWrap =
        next.page === line.page &&
        !line.isBullet &&
        !next.isBullet &&
        !isHandleOrContact(nextText) &&
        !/^[A-Z0-9][A-Z0-9\s|@]+$/.test(nextText) &&
        /^[a-z(0-9]/.test(nextText) &&
        trimmed.length > 0 &&
        !/[.!?:;]$/.test(trimmed);
      const bulletWrap = isBulletWrap(line, next);
      if (!hyphen && !lowercaseWrap && !bulletWrap) break;

      line = {
        ...line,
        text: joinText(trimmed, nextText, hyphen),
        items: [...line.items, ...next.items],
        isBullet: line.isBullet || next.isBullet,
      };
      i++;
    }

    merged.push(line);
  }

  return merged;
}
