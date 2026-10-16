import type { ExtractedTextItem } from "@/modules/resumes/extract/types";

const Y_TOLERANCE = 3;
const COLUMN_GAP = 36;
const WORD_GAP = 1.25;

const ORPHAN_BULLET = /^[•●◦∙·▪‣]\s*$/;

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

function canOwnBullet(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  if (/^(key contributions|highlights|responsibilities)$/i.test(trimmed)) return false;
  return true;
}

export function attachOrphanBullets(lines: GroupedLine[]): GroupedLine[] {
  const result: GroupedLine[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!ORPHAN_BULLET.test(line.text.trim())) {
      result.push(line);
      continue;
    }

    const previous = result.at(-1);
    if (previous && previous.page === line.page && canOwnBullet(previous.text)) {
      previous.isBullet = true;
      if (!/^[-•*–—●]\s+/.test(previous.text.trim())) {
        previous.text = `• ${previous.text.trim()}`;
      }
      previous.items = [...previous.items, ...line.items];
      continue;
    }

    const next = lines[index + 1];
    if (next && next.page === line.page && !ORPHAN_BULLET.test(next.text.trim())) {
      next.isBullet = true;
      if (!/^[-•*–—●]\s+/.test(next.text.trim())) {
        next.text = `• ${next.text.trim()}`;
      }
      next.items = [...line.items, ...next.items];
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

export function mergeWrappedLines(lines: GroupedLine[]): GroupedLine[] {
  const merged: GroupedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.text.trim();
    const next = lines[i + 1];

    const endsWithHyphen = /\w-$/.test(trimmed);
    const nextText = next?.text.trim() ?? "";
    const isHandleOrContact =
      /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(nextText) ||
      /@/.test(nextText) ||
      /^(?:https?:|mailto:)/i.test(nextText) ||
      /^(?:\d{4}|\d{1,2}\/\d{4})(?:\s*[-–—]\s*(?:present|current|\d{4}|\d{1,2}\/\d{4}))?$/i.test(nextText);
    const isContinuation =
      next &&
      next.page === line.page &&
      !line.isBullet &&
      !next.isBullet &&
      !isHandleOrContact &&
      !/^[A-Z0-9][A-Z0-9\s|@]+$/.test(nextText) &&
      /^[a-z(0-9]/.test(nextText);

    if (endsWithHyphen && next) {
      merged.push({
        ...line,
        text: trimmed + next.text.trim(),
        items: [...line.items, ...next.items],
      });
      i++;
      continue;
    }

    if (isContinuation && trimmed.length > 0 && !/[.!?:;]$/.test(trimmed) && next) {
      merged.push({
        ...line,
        text: `${trimmed} ${next.text.trim()}`,
        items: [...line.items, ...next.items],
      });
      i++;
      continue;
    }

    merged.push(line);
  }

  return merged;
}
