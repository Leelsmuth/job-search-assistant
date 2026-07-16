import type { Experience } from "@/modules/resumes/schema/resume-schema";
import {
  looksLikeCompanyName,
  looksLikeDateRange,
  looksLikeJobTitle,
} from "./experience-semantics";
import { normalizeExperienceDates } from "./experience-date-normalizer";

export function reconcileExperience(experience: Experience): Experience {
  const result = { ...experience };

  if (
    result.title &&
    looksLikeDateRange(result.title) &&
    result.company &&
    looksLikeJobTitle(result.company)
  ) {
    const dates = normalizeExperienceDates({ dateRange: result.title });
    result.title = result.company;
    result.company = null;
    result.startDateText = dates.startDateText;
    result.endDateText = dates.endDateText;
    result.startDate = dates.startDate;
    result.endDate = dates.endDate;
    result.isCurrent = dates.isCurrent;
    return result;
  }

  if (result.title && looksLikeDateRange(result.title) && !result.startDateText) {
    const dates = normalizeExperienceDates({ dateRange: result.title });
    result.startDateText = dates.startDateText;
    result.endDateText = dates.endDateText;
    result.startDate = dates.startDate;
    result.endDate = dates.endDate;
    result.isCurrent = dates.isCurrent;
    if (result.company && looksLikeJobTitle(result.company)) {
      result.title = result.company;
      result.company = null;
    }
  }

  if (!result.startDateText) {
    const dates = normalizeExperienceDates({
      startDateText: result.startDateText,
      endDateText: result.endDateText,
    });
    result.startDateText = dates.startDateText;
    result.endDateText = dates.endDateText;
    result.startDate = dates.startDate;
    result.endDate = dates.endDate;
    result.isCurrent = dates.isCurrent;
  }

  return result;
}

function areLikelySameExperience(a: Experience, b: Experience): boolean {
  const aHasSwappedMetadata =
    Boolean(a.title && looksLikeDateRange(a.title)) &&
    Boolean(a.company && looksLikeJobTitle(a.company)) &&
    a.achievements.length === 0;

  const bHasCompanyAndBullets =
    Boolean(b.title && looksLikeCompanyName(b.title) && !b.company) &&
    b.achievements.length > 0 &&
    !looksLikeDateRange(b.title ?? "");

  const aHasMetadataOnly =
    Boolean(a.startDateText || looksLikeDateRange(a.title ?? "")) &&
    Boolean(a.title || a.company) &&
    a.achievements.length === 0;

  const bHasCompanyBullets =
    Boolean(
      (b.company && looksLikeCompanyName(b.company)) ||
        (b.title && looksLikeCompanyName(b.title) && !b.company)
    ) && b.achievements.length > 0;

  return (
    (aHasSwappedMetadata && bHasCompanyAndBullets) ||
    (aHasMetadataOnly && bHasCompanyBullets)
  );
}

function mergeEntries(a: Experience, b: Experience): Experience {
  const company =
    b.company ??
    (b.title && looksLikeCompanyName(b.title) ? b.title : null) ??
    a.company;
  const title =
    a.company && looksLikeJobTitle(a.company)
      ? a.company
      : a.title && !looksLikeDateRange(a.title)
        ? a.title
        : b.title && looksLikeJobTitle(b.title)
          ? b.title
          : a.title;

  const dates = normalizeExperienceDates({
    dateRange:
      (a.title && looksLikeDateRange(a.title) ? a.title : null) ??
      (a.startDateText && a.endDateText
        ? `${a.startDateText} - ${a.endDateText}`
        : a.startDateText),
    startDateText: a.startDateText,
    endDateText: a.endDateText,
  });

  return reconcileExperience({
    ...a,
    company,
    title,
    startDateText: dates.startDateText,
    endDateText: dates.endDateText,
    startDate: dates.startDate,
    endDate: dates.endDate,
    isCurrent: dates.isCurrent,
    achievements: [...a.achievements, ...b.achievements],
    technologies: [...new Set([...a.technologies, ...b.technologies])],
    sourceEvidence: [...a.sourceEvidence, ...b.sourceEvidence],
  });
}

export function mergeExperienceFragments(entries: Experience[]): Experience[] {
  const merged: Experience[] = [];

  for (const entry of entries.map(reconcileExperience)) {
    const previous = merged.at(-1);
    if (previous && areLikelySameExperience(previous, entry)) {
      merged[merged.length - 1] = mergeEntries(previous, entry);
      continue;
    }
    merged.push(entry);
  }

  return merged.filter(
    (exp) =>
      exp.company ||
      exp.title ||
      exp.achievements.length > 0 ||
      exp.startDateText
  );
}

export function reconcileExperienceList(entries: Experience[]): Experience[] {
  return mergeExperienceFragments(entries.map(reconcileExperience));
}
