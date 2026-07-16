import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";
import {
  looksLikeCompanyName,
  looksLikeDateRange,
  looksLikeJobTitle,
} from "./experience-semantics";

export const DATE_RANGE =
  /(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*)?\d{4}\s*[-–—]\s*(?:Present|Current|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*)?\d{4}|\d{1,2}\/\d{4})/i;

export const BULLET_PREFIX = /^[-•*–—]\s+/;

export type ExperienceBlock = {
  headerLine: string;
  lines: GroupedLine[];
  company?: string;
  title?: string;
  dateRange?: string;
  location?: string;
};

export function isBulletLine(text: string, line?: GroupedLine): boolean {
  return BULLET_PREFIX.test(text.trim()) || Boolean(line?.isBullet);
}

export function parseExperienceHeaderFields(text: string): {
  company?: string;
  title?: string;
  dateRange?: string;
  location?: string;
} {
  const trimmed = text.trim();

  const atDateMatch = trimmed.match(
    new RegExp(`^(${DATE_RANGE.source})\\s+at\\s+(.+)$`, "i")
  );
  if (atDateMatch) {
    return {
      dateRange: atDateMatch[1].trim(),
      title: atDateMatch[2].trim(),
    };
  }

  const parts = trimmed.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 4) {
    const dateIdx = parts.findIndex((p) => DATE_RANGE.test(p));
    if (dateIdx === 2) {
      return {
        company: parts[0],
        title: parts[1],
        dateRange: parts[2],
        location: parts[3],
      };
    }
  }

  if (parts.length === 3) {
    const dateIdx = parts.findIndex((p) => DATE_RANGE.test(p));
    if (dateIdx === 2) {
      return { company: parts[0], title: parts[1], dateRange: parts[2] };
    }
    if (dateIdx === 1) {
      return { title: parts[0], dateRange: parts[1], location: parts[2] };
    }
    return { company: parts[0], title: parts[1], location: parts[2] };
  }

  if (parts.length === 2) {
    if (DATE_RANGE.test(parts[1]) && !DATE_RANGE.test(parts[0])) {
      return { title: parts[0], dateRange: parts[1] };
    }
    if (DATE_RANGE.test(parts[0]) && !DATE_RANGE.test(parts[1])) {
      return { dateRange: parts[0], title: parts[1] };
    }
    return { company: parts[0], title: parts[1] };
  }

  const dateMatch = trimmed.match(DATE_RANGE);
  if (dateMatch) {
    const remainder = trimmed
      .replace(dateMatch[0], "")
      .replace(/^\s*[-–—|]\s*/, "")
      .replace(/^\s*at\s+/i, "")
      .trim();
    return {
      dateRange: dateMatch[0],
      title: remainder || undefined,
    };
  }

  return { title: trimmed };
}

function countBullets(block: ExperienceBlock): number {
  return block.lines.filter((l) => isBulletLine(l.text, l)).length;
}

function isCompanyOnlyLine(text: string, nextLine?: GroupedLine): boolean {
  const trimmed = text.trim();
  if (!trimmed || isBulletLine(trimmed)) return false;
  if (trimmed.includes("|")) return false;
  if (DATE_RANGE.test(trimmed)) return false;
  if (trimmed.endsWith(".") || trimmed.length > 90) return false;
  if (!nextLine) return false;

  const next = nextLine.text.trim();
  return (
    trimmed.includes("|") === false &&
    (/\|/.test(next) ||
      DATE_RANGE.test(next) ||
      isBulletLine(next) ||
      /^\s*at\s+/i.test(next))
  );
}

function isExperienceEntryStart(
  lines: GroupedLine[],
  index: number
): boolean {
  const line = lines[index];
  const text = line.text.trim();
  if (!text || isBulletLine(text, line)) return false;

  if (/\|/.test(text) && text.length < 160) return true;
  if (DATE_RANGE.test(text) && text.length < 120) return true;

  const next = lines[index + 1];
  if (isCompanyOnlyLine(text, next)) return true;

  return false;
}

export function mergeSplitExperienceBlocks(
  blocks: ExperienceBlock[]
): ExperienceBlock[] {
  const merged: ExperienceBlock[] = [];
  let i = 0;

  while (i < blocks.length) {
    const a = blocks[i];
    const b = blocks[i + 1];

    if (
      b &&
      a.title &&
      a.dateRange &&
      !a.company &&
      countBullets(a) === 0 &&
      b.company &&
      !b.title &&
      !b.dateRange &&
      countBullets(b) > 0
    ) {
      merged.push({
        company: b.company,
        title: a.title,
        dateRange: a.dateRange,
        location: a.location ?? b.location,
        headerLine: a.headerLine,
        lines: [...a.lines, ...b.lines],
      });
      i += 2;
      continue;
    }

    if (
      b &&
      a.title &&
      a.dateRange &&
      !a.company &&
      countBullets(a) === 0 &&
      isCompanyNameBlock(b) &&
      countBullets(b) > 0
    ) {
      merged.push({
        company: b.title ?? b.headerLine,
        title: a.title,
        dateRange: a.dateRange,
        location: a.location ?? b.location,
        headerLine: a.headerLine,
        lines: [...a.lines, ...b.lines],
      });
      i += 2;
      continue;
    }

    if (b && isSwappedTitleDateBlock(a) && isCompanyNameBlock(b)) {
      merged.push({
        company: b.title ?? b.headerLine,
        title: a.company ?? undefined,
        dateRange: a.title ?? a.dateRange,
        location: a.location ?? b.location,
        headerLine: a.headerLine,
        lines: [...a.lines, ...b.lines],
      });
      i += 2;
      continue;
    }

    if (b && isCompanyNameBlock(a) && hasTitleOrDateHeader(b)) {
      merged.push({
        company: a.title ?? a.headerLine,
        title: b.title ?? b.company,
        dateRange: b.dateRange ?? (DATE_RANGE.test(b.title ?? "") ? b.title : undefined),
        location: b.location ?? a.location,
        headerLine: b.headerLine,
        lines: [...a.lines, ...b.lines],
      });
      i += 2;
      continue;
    }

    if (
      b &&
      isCompanyNameBlock(a) &&
      countBullets(a) === 0 &&
      countBullets(b) > 0 &&
      !b.company &&
      DATE_RANGE.test(b.title ?? "")
    ) {
      merged.push({
        company: a.title ?? a.headerLine,
        title: b.company ?? undefined,
        dateRange: b.title,
        location: b.location,
        headerLine: b.headerLine,
        lines: [...a.lines, ...b.lines],
      });
      i += 2;
      continue;
    }

    merged.push(a);
    i += 1;
  }

  return merged;
}

function isSwappedTitleDateBlock(block: ExperienceBlock): boolean {
  return (
    Boolean(block.title && DATE_RANGE.test(block.title)) &&
    Boolean(block.company && !DATE_RANGE.test(block.company)) &&
    countBullets(block) === 0
  );
}

function isCompanyNameBlock(block: ExperienceBlock): boolean {
  const name = block.title ?? block.headerLine;
  if (!name || block.company) return false;
  if (DATE_RANGE.test(name)) return false;
  if (name.includes("|")) return false;
  return countBullets(block) > 0 || !block.dateRange;
}

function hasTitleOrDateHeader(block: ExperienceBlock): boolean {
  return (
    Boolean(block.dateRange) ||
    DATE_RANGE.test(block.headerLine) ||
    /\|/.test(block.headerLine)
  );
}

type BlockAccumulator = ExperienceBlock;

function enrichBlockFromLines(block: BlockAccumulator): ExperienceBlock {
  const enriched: ExperienceBlock = { ...block };

  for (const line of block.lines) {
    const text = line.text.trim();
    if (!text || isBulletLine(text, line)) continue;

    if (!enriched.dateRange && looksLikeDateRange(text)) {
      enriched.dateRange = text;
      continue;
    }
    if (!enriched.title && looksLikeJobTitle(text)) {
      enriched.title = text;
      continue;
    }
    if (!enriched.company && looksLikeCompanyName(text)) {
      enriched.company = text;
    }
  }

  if (enriched.title && looksLikeDateRange(enriched.title) && !enriched.dateRange) {
    enriched.dateRange = enriched.title;
    enriched.title = undefined;
  }

  if (
    enriched.title &&
    looksLikeDateRange(enriched.title) &&
    enriched.company &&
    looksLikeJobTitle(enriched.company)
  ) {
    enriched.dateRange = enriched.title;
    enriched.title = enriched.company;
    enriched.company = undefined;
  }

  if (enriched.company && looksLikeJobTitle(enriched.company) && !enriched.title) {
    enriched.title = enriched.company;
    enriched.company = undefined;
  }

  if (enriched.title && looksLikeCompanyName(enriched.title) && !enriched.company) {
    if (!looksLikeJobTitle(enriched.title)) {
      enriched.company = enriched.title;
      enriched.title = undefined;
    }
  }

  return enriched;
}

function flushBlock(
  current: BlockAccumulator | null,
  blocks: ExperienceBlock[]
): BlockAccumulator | null {
  if (!current) return null;
  blocks.push(enrichBlockFromLines(current));
  return null;
}

export function parseExperienceBlocks(lines: GroupedLine[]): ExperienceBlock[] {
  const blocks: ExperienceBlock[] = [];
  let current: BlockAccumulator | null = null;
  let pendingCompany: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();
    if (!text) continue;

    if (isBulletLine(text, line)) {
      if (!current) {
        current = {
          headerLine: pendingCompany ?? text,
          lines: [],
          company: pendingCompany ?? undefined,
        };
        pendingCompany = null;
      }
      current.lines.push(line);
      continue;
    }

    if (
      current?.dateRange &&
      current.title &&
      !current.company &&
      looksLikeCompanyName(text) &&
      !looksLikeDateRange(text) &&
      !looksLikeJobTitle(text)
    ) {
      current.company = text;
      current.lines.push(line);
      continue;
    }

    if (current?.dateRange && !current.title && looksLikeJobTitle(text)) {
      current.title = text;
      current.lines.push(line);
      continue;
    }

    if (
      looksLikeDateRange(text) &&
      !/\|/.test(text) &&
      text.length < 120
    ) {
      current = flushBlock(current, blocks);
      current = {
        headerLine: text,
        lines: [line],
        dateRange: text,
      };
      pendingCompany = null;
      continue;
    }

    if (isExperienceEntryStart(lines, i)) {
      current = flushBlock(current, blocks);

      if (isCompanyOnlyLine(text, lines[i + 1])) {
        pendingCompany = text;
        continue;
      }

      const fields = parseExperienceHeaderFields(text);
      current = {
        headerLine: text,
        lines: [line],
        company: pendingCompany ?? fields.company,
        title: fields.title,
        dateRange: fields.dateRange,
        location: fields.location,
      };
      pendingCompany = null;
      continue;
    }

    if (!current) {
      current = {
        headerLine: text,
        lines: [line],
        ...parseExperienceHeaderFields(text),
      };
    } else {
      current.lines.push(line);
    }
  }

  flushBlock(current, blocks);

  if (pendingCompany && blocks.length > 0) {
    const first = blocks[0];
    if (!first.company) first.company = pendingCompany;
  }

  return mergeSplitExperienceBlocks(blocks.map(enrichBlockFromLines));
}
