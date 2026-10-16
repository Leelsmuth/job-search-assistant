import { FAST_BOARD_ESTIMATE_MS, WORKDAY_BOARD_ESTIMATE_MS } from "@/lib/cron-discover";
import type { JobSourceProvider } from "@/modules/ingestion/types";

/** Sources a user can turn on or off. Adzuna stays off until Settings enables it. */
export const DISCOVERY_SOURCE_IDS = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "smartrecruiters",
  "workable",
  "recruitee",
  "bamboohr",
  "teamtailor",
  "personio",
  "rippling",
  "jobbank",
  "remotive",
  "weworkremotely",
  "himalayas",
  "remoteok",
  "adzuna",
] as const;

export type DiscoverySourceId = (typeof DISCOVERY_SOURCE_IDS)[number];

export const PASTEABLE_BOARD_PROVIDERS = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "smartrecruiters",
  "workable",
  "recruitee",
  "bamboohr",
  "teamtailor",
  "personio",
  "rippling",
] as const;

export type PasteableBoardProvider = (typeof PASTEABLE_BOARD_PROVIDERS)[number];

const FEED_SOURCES = new Set<DiscoverySourceId>([
  "jobbank",
  "remotive",
  "weworkremotely",
  "himalayas",
  "remoteok",
  "adzuna",
]);

const DIRECT_ATS = new Set<DiscoverySourceId>([
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "smartrecruiters",
  "workable",
  "recruitee",
  "bamboohr",
  "teamtailor",
  "personio",
  "rippling",
]);

export type SourceCredit = {
  name: string;
  href: string;
  applyNote: string;
};

export const SOURCE_LABELS: Record<DiscoverySourceId, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  recruitee: "Recruitee",
  bamboohr: "BambooHR",
  teamtailor: "Teamtailor",
  personio: "Personio",
  rippling: "Rippling",
  jobbank: "Job Bank",
  remotive: "Remotive",
  weworkremotely: "We Work Remotely",
  himalayas: "Himalayas",
  remoteok: "Remote OK",
  adzuna: "Adzuna",
};

/** Visible credit required by the publisher. Direct ATS boards do not need it. */
export const SOURCE_CREDITS: Partial<Record<DiscoverySourceId, SourceCredit>> = {
  jobbank: {
    name: "Job Bank",
    href: "https://www.jobbank.gc.ca",
    applyNote: "Open the Job Bank posting. Data is from the Open Government Licence – Canada.",
  },
  remotive: {
    name: "Remotive",
    href: "https://remotive.com",
    applyNote: "Apply through the Remotive listing.",
  },
  weworkremotely: {
    name: "We Work Remotely",
    href: "https://weworkremotely.com",
    applyNote: "Apply through the We Work Remotely listing.",
  },
  himalayas: {
    name: "Himalayas",
    href: "https://himalayas.app",
    applyNote: "Apply through the Himalayas application link.",
  },
  remoteok: {
    name: "Remote OK",
    href: "https://remoteok.com",
    applyNote: "Apply through the Remote OK listing.",
  },
  adzuna: {
    name: "Adzuna",
    href: "https://www.adzuna.ca",
    applyNote: "Apply through Adzuna.",
  },
};

export type DiscoveryFeed = {
  id: Extract<
    DiscoverySourceId,
    "jobbank" | "remotive" | "weworkremotely" | "himalayas" | "remoteok" | "adzuna"
  >;
  label: string;
  /** Public URL stored as the board key. Never includes API keys. */
  publicUrl: string;
};

export const DISCOVERY_FEEDS: readonly DiscoveryFeed[] = [
  {
    id: "jobbank",
    label: "Job Bank Canada",
    publicUrl: "https://open.canada.ca/data/en/dataset/ea639e28-c0fc-48bf-b5dd-b8899bd43072",
  },
  {
    id: "remotive",
    label: "Remotive",
    publicUrl: "https://remotive.com/api/remote-jobs?category=software-dev",
  },
  {
    id: "weworkremotely",
    label: "We Work Remotely",
    publicUrl: "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
  },
  {
    id: "himalayas",
    label: "Himalayas",
    publicUrl: "https://himalayas.app/jobs/api/search?q=frontend%20engineer",
  },
  {
    id: "remoteok",
    label: "Remote OK",
    publicUrl: "https://remoteok.com/api?tag=frontend",
  },
  {
    id: "adzuna",
    label: "Adzuna",
    publicUrl: "https://api.adzuna.com/v1/api/jobs/ca/search/1",
  },
];

export function isDiscoverySourceId(value: string): value is DiscoverySourceId {
  return (DISCOVERY_SOURCE_IDS as readonly string[]).includes(value);
}

export function isFeedProvider(provider: string): provider is DiscoveryFeed["id"] {
  return FEED_SOURCES.has(provider as DiscoverySourceId);
}

export function isDirectAtsProvider(provider: string): boolean {
  return DIRECT_ATS.has(provider as DiscoverySourceId);
}

export function defaultDiscoverySourceEnabled(sourceId: string): boolean {
  return sourceId !== "adzuna";
}

export function defaultEnabledDiscoverySources(): Record<DiscoverySourceId, boolean> {
  return Object.fromEntries(
    DISCOVERY_SOURCE_IDS.map((id) => [id, defaultDiscoverySourceEnabled(id)])
  ) as Record<DiscoverySourceId, boolean>;
}

export function isDiscoverySourceEnabled(
  configured: Partial<Record<string, boolean>> | null | undefined,
  sourceId: string
): boolean {
  if (configured && Object.prototype.hasOwnProperty.call(configured, sourceId)) {
    return configured[sourceId] === true;
  }
  return defaultDiscoverySourceEnabled(sourceId);
}

export function normalizeEnabledDiscoverySources(
  value: unknown
): Record<DiscoverySourceId, boolean> {
  const defaults = defaultEnabledDiscoverySources();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const record = value as Record<string, unknown>;
  const next = { ...defaults };
  for (const id of DISCOVERY_SOURCE_IDS) {
    if (typeof record[id] === "boolean") next[id] = record[id];
  }
  return next;
}

export function sourceLabel(provider: string | null | undefined): string {
  if (!provider) return "Manual";
  if (isDiscoverySourceId(provider)) return SOURCE_LABELS[provider];
  if (provider === "pasted_description") return "Pasted";
  if (provider === "generic_web") return "Web";
  if (provider === "manual") return "Manual";
  return provider;
}

export function sourceCredit(provider: string | null | undefined): SourceCredit | null {
  if (!provider || !isDiscoverySourceId(provider)) return null;
  return SOURCE_CREDITS[provider] ?? null;
}

/** Higher wins. A direct apply link replaces an aggregator listing of the same role. */
export function sourceRank(provider: string | null | undefined): number {
  if (!provider) return 0;
  if (isDirectAtsProvider(provider)) return 100;
  if (provider === "jobbank") return 80;
  if (provider === "adzuna") return 50;
  if (isFeedProvider(provider)) return 30;
  return 10;
}

export function incomingSourceWins(
  existingProvider: string | null | undefined,
  incomingProvider: string
): boolean {
  if (!existingProvider) return false;
  return sourceRank(incomingProvider) > sourceRank(existingProvider);
}

export function withSourceCredit(description: string, provider: string): string {
  const credit = sourceCredit(provider);
  if (!credit) return description;
  const line = `Source: ${credit.name} (${credit.href}). ${credit.applyNote}`;
  if (description.includes(credit.href)) return description;
  return `${description.trim()}\n\n${line}`;
}

export function estimateProviderMs(provider: string): number {
  if (provider === "workday") return WORKDAY_BOARD_ESTIMATE_MS;
  if (provider === "smartrecruiters" || provider === "rippling" || provider === "bamboohr") {
    return 45_000;
  }
  if (provider === "workable" || provider === "jobbank") return 35_000;
  if (isFeedProvider(provider)) return 20_000;
  if (provider === "personio" || provider === "teamtailor" || provider === "recruitee") {
    return 15_000;
  }
  return FAST_BOARD_ESTIMATE_MS;
}

export function adzunaConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ADZUNA_APP_ID?.trim() && env.ADZUNA_APP_KEY?.trim());
}

export function configuredDiscoveryFeeds(
  env: NodeJS.ProcessEnv = process.env
): readonly DiscoveryFeed[] {
  if (adzunaConfigured(env)) return DISCOVERY_FEEDS;
  return DISCOVERY_FEEDS.filter((feed) => feed.id !== "adzuna");
}

export function feedPublicUrl(provider: string): string {
  return DISCOVERY_FEEDS.find((feed) => feed.id === provider)?.publicUrl ?? "";
}

export function isPasteableBoardProvider(value: string): value is PasteableBoardProvider {
  return (PASTEABLE_BOARD_PROVIDERS as readonly string[]).includes(value);
}

export type { JobSourceProvider };
