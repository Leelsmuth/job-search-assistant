import { looksLikeDateRange } from "./experience-semantics";

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function monthKey(token: string): string {
  const lower = token.toLowerCase().replace(/\./g, "");
  if (lower.startsWith("sept")) return "sept";
  return lower.slice(0, 3);
}

export function parseMonthYearToken(text: string): string | null {
  const trimmed = text.trim();
  const named = trimmed.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})$/i
  );
  if (named) {
    const monthNum = MONTH_MAP[monthKey(named[1])];
    if (!monthNum) return null;
    return `${named[2]}-${monthNum}`;
  }

  const numeric = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (numeric) {
    return `${numeric[2]}-${numeric[1].padStart(2, "0")}`;
  }

  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) return `${yearOnly[1]}-01`;

  return null;
}

export function normalizeExperienceDates(input: {
  startDateText?: string | null;
  endDateText?: string | null;
  dateRange?: string | null;
}): {
  startDateText: string | null;
  endDateText: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
} {
  let startDateText = input.startDateText?.trim() || null;
  let endDateText = input.endDateText?.trim() || null;

  if (!startDateText && input.dateRange && looksLikeDateRange(input.dateRange)) {
    const parts = input.dateRange.split(/\s*[-–—]\s*/);
    startDateText = parts[0]?.trim() || null;
    endDateText = parts[1]?.trim() || null;
  }

  const isCurrent = /^(present|current)$/i.test(endDateText ?? "");
  const startDate = startDateText ? parseMonthYearToken(startDateText) : null;
  const endDate =
    endDateText && !isCurrent ? parseMonthYearToken(endDateText) : null;

  return {
    startDateText,
    endDateText,
    startDate,
    endDate,
    isCurrent,
  };
}
