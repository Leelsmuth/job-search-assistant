import type { JobSourceProvider } from "@/modules/ingestion/types";

export type CuratedBoard = {
  companyName: string;
  provider: Extract<JobSourceProvider, "greenhouse" | "lever" | "ashby" | "workday">;
  boardUrl: string;
  why: string;
};

/** Verified public boards from the company catalog. Polled only when the setting is on. */
export const CURATED_CANADA_BOARDS: CuratedBoard[] = [
  {
    companyName: "Wealthsimple",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/wealthsimple",
    why: "Canadian company with remote-Canada roles",
  },
  {
    companyName: "1Password",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/1password",
    why: "Canadian company with remote-Canada roles",
  },
  {
    companyName: "Cohere",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/cohere",
    why: "Canadian company with frontend and remote-Canada roles",
  },
  {
    companyName: "Hopper",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/hopper",
    why: "Canadian company with remote-Canada roles",
  },
  {
    companyName: "Jobber",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/jobber",
    why: "Canadian company with remote-Canada roles",
  },
  {
    companyName: "Lightspeed",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/lightspeedhq",
    why: "Canadian company with remote-Canada roles",
  },
  {
    companyName: "Hootsuite",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/hootsuite",
    why: "Canadian company on Greenhouse",
  },
  {
    companyName: "Docebo",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/docebo",
    why: "Remote-Canada roles with frontend postings",
  },
  {
    companyName: "Telus Digital",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/telus-digital",
    why: "Canadian employer with remote-Canada roles",
  },
  {
    companyName: "Unbounce",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/unbounce",
    why: "Canadian company on Greenhouse",
  },
  {
    companyName: "Thinkific",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/thinkific",
    why: "Canadian company on Greenhouse",
  },
  {
    companyName: "Later",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/later",
    why: "Canadian company on Greenhouse",
  },
  {
    companyName: "StackAdapt",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/stackadapt",
    why: "Canadian company on Greenhouse",
  },
  {
    companyName: "GitLab",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/gitlab",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Stripe",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/stripe",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Mozilla",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/mozilla",
    why: "Remote-friendly board with Canada-eligible roles",
  },
];

export const CURATED_BOARDS_PER_CRON_RUN = 2;

function canonical(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/** Rotate a couple of unsaved boards per day so a cron run stays small. */
export function pickCuratedBoards(
  savedBoardUrls: Iterable<string>,
  limit = CURATED_BOARDS_PER_CRON_RUN,
  now = new Date()
): CuratedBoard[] {
  const saved = new Set([...savedBoardUrls].map(canonical));
  const available = CURATED_CANADA_BOARDS.filter((board) => !saved.has(canonical(board.boardUrl)));
  if (available.length === 0 || limit <= 0) return [];

  const start = Math.floor(now.getTime() / 86_400_000) % available.length;
  const picked: CuratedBoard[] = [];
  for (let index = 0; index < available.length && picked.length < limit; index++) {
    picked.push(available[(start + index) % available.length]);
  }
  return picked;
}
