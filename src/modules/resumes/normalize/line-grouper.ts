import type { ExtractedTextItem } from "@/modules/resumes/extract/types";

const Y_TOLERANCE = 3;
const LINE_GAP_THRESHOLD = 14;

export type GroupedLine = {
  text: string;
  page: number;
  items: ExtractedTextItem[];
  fontSize?: number;
  isBullet: boolean;
};

function isBulletText(text: string): boolean {
  return /^[-•*–—]\s+/.test(text.trim());
}

export function groupItemsIntoLines(items: ExtractedTextItem[]): GroupedLine[] {
  if (items.length === 0) return [];

  const hasCoords = items.some((i) => i.y !== undefined && i.x !== undefined);

  if (!hasCoords) {
    return items.map((item) => ({
      text: item.text,
      page: item.page,
      items: [item],
      fontSize: item.fontSize,
      isBullet: isBulletText(item.text),
    }));
  }

  const sorted = [...items].sort((a, b) => {
    const pageDiff = a.page - b.page;
    if (pageDiff !== 0) return pageDiff;
    const yDiff = (b.y ?? 0) - (a.y ?? 0);
    if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
    return (a.x ?? 0) - (b.x ?? 0);
  });

  const lines: GroupedLine[] = [];
  let current: GroupedLine | null = null;
  let lastY: number | undefined;

  for (const item of sorted) {
    const y = item.y ?? 0;
    const sameLine =
      current &&
      current.page === item.page &&
      lastY !== undefined &&
      Math.abs(y - lastY) <= Y_TOLERANCE;

    if (sameLine && current) {
      const gap = Math.abs((item.x ?? 0) - (current.items.at(-1)?.x ?? 0));
      const spacer = gap > LINE_GAP_THRESHOLD ? " " : "";
      current.text += spacer + item.text;
      current.items.push(item);
      current.fontSize = Math.max(current.fontSize ?? 0, item.fontSize ?? 0);
    } else {
      if (current) lines.push(current);
      current = {
        text: item.text,
        page: item.page,
        items: [item],
        fontSize: item.fontSize,
        isBullet: isBulletText(item.text),
      };
      lastY = y;
    }
  }
  if (current) lines.push(current);

  return lines;
}

export function mergeWrappedLines(lines: GroupedLine[]): GroupedLine[] {
  const merged: GroupedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.text.trim();
    const next = lines[i + 1];

    const endsWithHyphen = /\w-$/.test(trimmed);
    const isContinuation =
      next &&
      next.page === line.page &&
      !line.isBullet &&
      !next.isBullet &&
      !/^[A-Z0-9][A-Z0-9\s|@]+$/.test(next.text.trim()) &&
      /^[a-z(0-9]/.test(next.text.trim());

    if (endsWithHyphen && next) {
      merged.push({
        ...line,
        text: trimmed + next.text.trim(),
        items: [...line.items, ...next.items],
      });
      i++;
      continue;
    }

    if (
      isContinuation &&
      trimmed.length > 0 &&
      !/[.!?:;]$/.test(trimmed) &&
      next
    ) {
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
