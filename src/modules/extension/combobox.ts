import type { ApplicationProfile } from "@/modules/apply/types";
import { normalizeQuestionLabel } from "@/modules/apply/questions";
import type { ComboboxMatch, PageField } from "@/modules/extension/page-types";
import { isNavigationControl } from "@/modules/extension/urls";

const PROVINCES: Record<string, string> = {
  ab: "Alberta",
  bc: "British Columbia",
  mb: "Manitoba",
  nb: "New Brunswick",
  nl: "Newfoundland and Labrador",
  ns: "Nova Scotia",
  nt: "Northwest Territories",
  nu: "Nunavut",
  on: "Ontario",
  pe: "Prince Edward Island",
  qc: "Quebec",
  sk: "Saskatchewan",
  yt: "Yukon",
};

const GTA = new Set([
  "toronto",
  "north york",
  "scarborough",
  "etobicoke",
  "east york",
  "york",
  "mississauga",
  "brampton",
  "markham",
  "vaughan",
  "richmond hill",
  "oakville",
  "pickering",
  "ajax",
  "milton",
  "burlington",
  "whitby",
  "oshawa",
  "newmarket",
  "gta",
  "greater toronto",
  "greater toronto area",
]);

export type ComboboxPlan = {
  value: string;
  queries: string[];
  match: ComboboxMatch;
};

export type ComboboxSession = {
  selected(): string;
  focus(): void;
  open(): void;
  setQuery(query: string): void;
  readOptions(): string[];
  /** Choose one listbox option. Return false if that option cannot be activated. */
  choose(option: string): boolean;
  dismiss(): void;
};

export function isComboboxControl(input: {
  role?: string;
  ariaAutocomplete?: string;
  className?: string;
}): boolean {
  if ((input.role || "").toLowerCase() === "combobox") return true;
  if ((input.ariaAutocomplete || "").toLowerCase() === "list") return true;
  const className = input.className || "";
  return /\bselect__input\b/.test(className) || /\biti__selected-country\b/.test(className) || /\biti__search-input\b/.test(className);
}

/** Refuse submit, apply, and next/continue controls. Listbox options stay allowed. */
export function canActivateLabel(label: string, type: string | null | undefined): boolean {
  if ((type || "").toLowerCase() === "submit") return false;
  const text = label.trim();
  if (!text) return true;
  if (isNavigationControl(text)) return false;
  if (/^apply\b/i.test(text)) return false;
  return true;
}

export function prefersCanada(profile: Pick<ApplicationProfile, "workAuthorization" | "province" | "city">): boolean {
  const auth = profile.workAuthorization.toLowerCase();
  if (/canad/.test(auth)) return true;
  if (PROVINCES[profile.province.trim().toLowerCase().replace(/\./g, "")]) return true;
  const city = profile.city.trim().toLowerCase();
  if (GTA.has(city) || /\b(montreal|montréal|vancouver|ottawa|calgary|edmonton|winnipeg|halifax|victoria|quebec|québec)\b/.test(city)) {
    return true;
  }
  return false;
}

export function isGta(profile: Pick<ApplicationProfile, "city" | "province">): boolean {
  const city = profile.city.trim().toLowerCase();
  if (GTA.has(city) || /\bgta\b|greater toronto/.test(city)) return true;
  const province = profile.province.trim().toLowerCase().replace(/\./g, "");
  return province === "on" || province === "ontario" ? /\btoronto\b/.test(city) : false;
}

export function expandProvince(value: string): string {
  const key = value.trim().toLowerCase().replace(/\./g, "");
  return PROVINCES[key] ?? value.trim();
}

export function formatPlace(profile: Pick<ApplicationProfile, "city" | "province">): string {
  const city = profile.city.trim();
  const province = expandProvince(profile.province);
  if (city && province && city.toLowerCase() !== province.toLowerCase()) return `${city}, ${province}`;
  return city || province;
}

export function isWorkIntentLabel(label: string): boolean {
  return (
    (/intend/.test(label) && /work/.test(label)) ||
    /where (do|will|would) you (intend|plan|prefer|want|like) to work/.test(label) ||
    /where will you (be )?work/.test(label) ||
    /preferred work location|intended work location|work location preference/.test(label)
  );
}

export function isPhoneCountryField(field: Pick<PageField, "label" | "id" | "name" | "groupLabel">): boolean {
  const label = normalizeQuestionLabel(field.label);
  const group = normalizeQuestionLabel(field.groupLabel ?? "");
  const technical = normalizeQuestionLabel(`${field.id} ${field.name}`);
  if (/country of|which country|work country|country you|reside|citizenship/.test(label)) return false;
  const bare =
    label === "country" ||
    label === "country code" ||
    label === "dial code" ||
    label === "dialing code" ||
    label === "phone country";
  if (!bare && !/\b(phone country|country code|dial code)\b/.test(label)) return false;
  return /\bphone\b/.test(`${group} ${technical} ${label}`) || (label === "country" && /\bphone\b/.test(group));
}

/** Text to type into a free-text location-intent question. */
export function workIntentAnswer(profile: ApplicationProfile, description: string): string {
  const place = formatPlace(profile);
  const asksPlace = /\b(city|province|state)\b/.test(description.toLowerCase());
  if (asksPlace && place) return place;
  if (isGta(profile)) return "Hybrid, Toronto / GTA";
  if (prefersCanada(profile)) return "Remote, Canada";
  return place;
}

export function workIntentQueries(profile: ApplicationProfile): string[] {
  const queries: string[] = [];
  if (prefersCanada(profile)) queries.push("Remote, Canada");
  if (isGta(profile)) queries.push("Hybrid, Toronto / GTA");
  const place = formatPlace(profile);
  if (place) queries.push(place);
  if (prefersCanada(profile)) queries.push("Canada");
  if (prefersCanada(profile) && /citizen/.test(profile.workAuthorization.toLowerCase())) queries.push("Canadian citizen");
  return unique(queries);
}

export function phoneCountryPlan(profile: ApplicationProfile): ComboboxPlan | null {
  if (!prefersCanada(profile)) return null;
  return { value: "Canada", queries: ["Canada", "Canada +1"], match: "phoneCountry" };
}

export function placePlan(profile: ApplicationProfile): ComboboxPlan | null {
  const place = formatPlace(profile);
  const city = profile.city.trim();
  if (!place && !city) return null;
  return {
    value: place || city,
    queries: unique([place, city && profile.province.trim() ? `${city}, ${profile.province.trim()}` : "", city]),
    match: "place",
  };
}

export function workIntentPlan(profile: ApplicationProfile, description: string): ComboboxPlan | null {
  const queries = workIntentQueries(profile);
  const value = workIntentAnswer(profile, description);
  if (!value && queries.length === 0) return null;
  return { value: value || queries[0], queries: queries.length ? queries : [value], match: "workIntent" };
}

type Scored = { option: string; score: number };

function tokens(value: string): string[] {
  return normalizeQuestionLabel(value)
    .split(" ")
    .filter((word) => word.length > 1 && word !== "and");
}

function hasCanada(value: string): boolean {
  return /\bcanada\b|\bcanadian\b/.test(normalizeQuestionLabel(value));
}

function hasUnitedStates(value: string): boolean {
  const text = normalizeQuestionLabel(value);
  return /\bunited states\b|\busa\b|\bu s\b|\bamerican\b/.test(text);
}

function scoreAgainst(option: string, query: string, match: ComboboxMatch): number {
  const optionNorm = normalizeQuestionLabel(option);
  const queryNorm = normalizeQuestionLabel(query);
  if (!optionNorm || !queryNorm) return 0;
  if (match === "yesNo") {
    return optionNorm === queryNorm ? 100 : 0;
  }
  if (match === "phoneCountry") {
    if (hasUnitedStates(option) && !hasCanada(option)) return 0;
    if (optionNorm === "canada" || optionNorm === "ca") return 100;
    if (hasCanada(option)) return 90;
    return 0;
  }

  const optionTokens = new Set(tokens(option));
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return 0;
  let overlap = 0;
  for (const token of queryTokens) if (optionTokens.has(token)) overlap += 1;
  if (match === "place" && overlap < queryTokens.length) return 0;

  let score = overlap * 20;
  if (hasCanada(option) && hasCanada(query)) score += 40;
  if (hasUnitedStates(option) && hasCanada(query) && !hasCanada(option)) score -= 80;
  if (optionTokens.has("toronto") && queryTokens.includes("toronto")) score += 40;
  if (optionTokens.has("gta") && (queryTokens.includes("gta") || queryTokens.includes("toronto"))) score += 20;
  if (optionTokens.has("ontario") && queryTokens.includes("ontario")) score += 20;
  if (optionTokens.has("remote") && queryTokens.includes("remote") && hasCanada(option) && hasCanada(query)) score += 25;
  if (optionTokens.has("hybrid") && queryTokens.includes("hybrid") && (optionTokens.has("toronto") || optionTokens.has("gta"))) {
    score += 25;
  }
  if (optionTokens.has("citizen") && queryTokens.includes("citizen") && hasCanada(option)) score += 15;
  if (optionNorm === queryNorm) score += 30;
  return score;
}

function threshold(match: ComboboxMatch): number {
  if (match === "yesNo") return 100;
  if (match === "phoneCountry") return 80;
  if (match === "place") return 40;
  if (match === "workIntent") return 70;
  return 60;
}

/**
 * Pick the closest visible option. Queries are tried in order so a stronger
 * location intent (remote Canada, then hybrid Toronto) wins before a weaker one.
 * Returns null when nothing clears the threshold.
 */
export function bestComboboxOption(options: string[], queries: string[], match: ComboboxMatch): Scored | null {
  const cleaned = options.map((option) => option.replace(/\s+/g, " ").trim()).filter(Boolean);
  const limit = threshold(match);
  for (const query of queries) {
    let best: Scored | null = null;
    for (const option of cleaned) {
      const score = scoreAgainst(option, query, match);
      if (score >= limit && (!best || score > best.score)) best = { option, score };
    }
    if (best) return best;
  }
  return null;
}

export function selectionMatches(selected: string, chosen: string, queries: string[], match: ComboboxMatch): boolean {
  const value = selected.replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (normalizeQuestionLabel(value) === normalizeQuestionLabel(chosen)) return true;
  return Boolean(bestComboboxOption([value], [chosen, ...queries], match));
}

export async function runComboboxFill(
  session: ComboboxSession,
  plan: ComboboxPlan,
  wait: (ms: number) => Promise<void>,
  timing: { timeoutMs?: number; verifyMs?: number } = {}
): Promise<{ ok: true; value: string } | { ok: false; reason: string }> {
  const timeoutMs = timing.timeoutMs ?? 1400;
  const verifyMs = timing.verifyMs ?? 500;
  const already = session.selected();
  if (already && bestComboboxOption([already], plan.queries, plan.match)) {
    return { ok: true, value: already };
  }

  for (const query of plan.queries) {
    session.focus();
    session.open();
    session.setQuery(query);
    const options = await waitForOptions(session, wait, timeoutMs);
    const best = bestComboboxOption(options, [query, ...plan.queries], plan.match);
    if (!best) {
      session.dismiss();
      continue;
    }
    if (!session.choose(best.option)) {
      session.dismiss();
      continue;
    }
    const selected = await waitForSelection(session, best.option, plan.queries, plan.match, wait, verifyMs);
    if (selected) return { ok: true, value: selected };
    session.dismiss();
  }

  session.dismiss();
  return { ok: false, reason: "No matching option in the list." };
}

async function waitForOptions(session: ComboboxSession, wait: (ms: number) => Promise<void>, timeoutMs: number) {
  const started = Date.now();
  let options = session.readOptions();
  while (options.length === 0 && Date.now() - started < timeoutMs) {
    await wait(40);
    options = session.readOptions();
  }
  return options;
}

async function waitForSelection(
  session: ComboboxSession,
  chosen: string,
  queries: string[],
  match: ComboboxMatch,
  wait: (ms: number) => Promise<void>,
  verifyMs: number
): Promise<string | null> {
  const started = Date.now();
  let selected = session.selected();
  while (!selectionMatches(selected, chosen, queries, match) && Date.now() - started < verifyMs) {
    await wait(40);
    selected = session.selected();
  }
  return selectionMatches(selected, chosen, queries, match) ? selected : null;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeQuestionLabel(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
