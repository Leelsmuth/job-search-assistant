import type { ExtractedTextItem } from "@/modules/resumes/extract/types";

const PAGE_NUMBER = /^\d{1,3}$/;
const REPEATED_HEADER =
  /^(page \d+ of \d+|confidential|resume|curriculum vitae)$/i;

export function removeRepeatedHeadersFooters(
  pages: Array<{ pageNumber: number; items: ExtractedTextItem[] }>
): ExtractedTextItem[] {
  const lineCounts = new Map<string, number>();

  for (const page of pages) {
    const seenOnPage = new Set<string>();
    for (const item of page.items) {
      const key = item.text.trim().toLowerCase();
      if (!key || key.length > 80) continue;
      if (seenOnPage.has(key)) continue;
      seenOnPage.add(key);
      lineCounts.set(key, (lineCounts.get(key) ?? 0) + 1);
    }
  }

  const repeated = new Set(
    [...lineCounts.entries()]
      .filter(([key, count]) => count >= 2 && pages.length >= 2 && key.length < 60)
      .map(([key]) => key)
  );

  const result: ExtractedTextItem[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      const key = item.text.trim().toLowerCase();
      if (PAGE_NUMBER.test(key)) continue;
      if (REPEATED_HEADER.test(key)) continue;
      if (repeated.has(key)) continue;
      result.push(item);
    }
  }
  return result;
}
