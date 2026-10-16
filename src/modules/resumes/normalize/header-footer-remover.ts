import type { ExtractedTextItem } from "@/modules/resumes/extract/types";

const PAGE_NUMBER =
  /^(?:page\s+)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$/i;

/** Running headers and footers sit in this band; body text does not. */
const MARGIN_FRACTION = 0.08;
const SIMILAR_Y = 8;

type PageInput = {
  pageNumber: number;
  height?: number;
  items: ExtractedTextItem[];
};

type MarginItem = {
  item: ExtractedTextItem;
  page: number;
  zone: "top" | "bottom";
  y: number;
};

function pageHeight(page: PageInput): number | null {
  if (page.height && page.height > 0) return page.height;
  const ys = page.items
    .map((item) => item.y)
    .filter((y): y is number => typeof y === "number");
  if (ys.length === 0) return null;
  return Math.max(...ys) + 36;
}

function marginZone(y: number, height: number): "top" | "bottom" | null {
  if (y >= height * (1 - MARGIN_FRACTION)) return "top";
  if (y <= height * MARGIN_FRACTION) return "bottom";
  return null;
}

function isPageNumber(text: string): boolean {
  return PAGE_NUMBER.test(text.trim());
}

/**
 * Drop running headers, footers, and page numbers.
 * A repeated short string is removed only when it sits in the top or bottom
 * ~8% of the page and repeats at a similar y on most pages. Body copies of
 * titles, the word "of", and bullet glyphs stay.
 */
export function removeRepeatedHeadersFooters(pages: PageInput[]): ExtractedTextItem[] {
  const margin: MarginItem[] = [];

  for (const page of pages) {
    const height = pageHeight(page);
    if (!height) continue;
    for (const item of page.items) {
      if (typeof item.y !== "number") continue;
      const zone = marginZone(item.y, height);
      if (!zone) continue;
      margin.push({ item, page: page.pageNumber, zone, y: item.y });
    }
  }

  const remove = new Set<ExtractedTextItem>();
  for (const entry of margin) {
    if (isPageNumber(entry.item.text)) remove.add(entry.item);
  }

  const groups = new Map<string, MarginItem[]>();
  for (const entry of margin) {
    const text = entry.item.text.trim().toLowerCase();
    if (!text || text.length > 80) continue;
    const key = `${entry.zone}:${text}`;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  const pageCount = pages.length;
  for (const entries of groups.values()) {
    const clusters: MarginItem[][] = [];
    for (const entry of entries) {
      const cluster = clusters.find((items) => Math.abs(items[0].y - entry.y) <= SIMILAR_Y);
      if (cluster) cluster.push(entry);
      else clusters.push([entry]);
    }
    for (const cluster of clusters) {
      const pagesHit = new Set(cluster.map((entry) => entry.page));
      if (pageCount >= 2 && pagesHit.size * 2 > pageCount) {
        for (const entry of cluster) remove.add(entry.item);
      }
    }
  }

  const result: ExtractedTextItem[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (remove.has(item)) continue;
      result.push(item);
    }
  }
  return result;
}
