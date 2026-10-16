import { DEFAULT_TARGET_TITLES } from "@/modules/matching/search-preferences";

export type SharedTargets = {
  targetTitles: string[];
  minimumSalaryCad: number | null;
};

function cleanTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const titles = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [...new Set(titles)].slice(0, 12);
}

/**
 * One list of titles and one CAD minimum, taken from whichever side actually has a value.
 * Settings titles win when the profile list is empty. Profile salary wins when settings salary is empty.
 */
export function resolveSharedTargets(input: {
  profileTitles?: unknown;
  preferenceTitles?: unknown;
  profileSalary?: number | null;
  preferenceSalary?: number | null;
}): SharedTargets {
  const profileTitles = cleanTitles(input.profileTitles);
  const preferenceTitles = cleanTitles(input.preferenceTitles);
  const targetTitles =
    profileTitles.length > 0
      ? profileTitles
      : preferenceTitles.length > 0
        ? preferenceTitles
        : [...DEFAULT_TARGET_TITLES];
  const minimumSalaryCad = input.preferenceSalary ?? input.profileSalary ?? null;
  return { targetTitles, minimumSalaryCad };
}

export function sameTitles(left: unknown, right: string[]): boolean {
  const cleaned = cleanTitles(left);
  if (cleaned.length !== right.length) return false;
  return cleaned.every((title, index) => title === right[index]);
}
