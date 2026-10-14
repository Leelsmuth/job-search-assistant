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
    why: "Canadian company on Greenhouse; board is live but currently lists no jobs",
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
  {
    companyName: "Achievers",
    provider: "lever",
    boardUrl: "https://jobs.lever.co/achievers",
    why: "Canadian company with Toronto engineering roles",
  },
  {
    companyName: "AlayaCare",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/alayacare",
    why: "Canadian company with Montreal engineering roles",
  },
  {
    companyName: "AppDirect",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/appdirect",
    why: "Canadian company with Montreal engineering roles",
  },
  {
    companyName: "AutoTrader",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/autotradercanada",
    why: "Canadian company with Toronto engineering roles",
  },
  {
    companyName: "Benevity",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/benevity",
    why: "Canadian company with Toronto engineering roles",
  },
  {
    companyName: "Coveo",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/coveoen",
    why: "Canadian company with Quebec frontend roles",
  },
  {
    companyName: "D2L",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/d2l",
    why: "Canadian company with Toronto and remote-Canada roles",
  },
  {
    companyName: "Faire",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/faire",
    why: "Canadian company with Toronto frontend roles",
  },
  {
    companyName: "Felix",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/felix",
    why: "Canadian company with Toronto and remote-Canada roles",
  },
  {
    companyName: "Float",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/float",
    why: "Canadian company with remote-Canada roles",
  },
  {
    companyName: "Fullscript",
    provider: "lever",
    boardUrl: "https://jobs.lever.co/fullscript",
    why: "Canadian company with Toronto engineering roles",
  },
  {
    companyName: "Jane",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/jane",
    why: "Canadian company with remote-Canada roles",
  },
  {
    companyName: "Klue",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/klue",
    why: "Canadian company with Toronto engineering roles",
  },
  {
    companyName: "Konrad Group",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/konradgroup",
    why: "Canadian company with Toronto frontend roles",
  },
  {
    companyName: "League",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/leagueinc",
    why: "Canadian company with Toronto engineering roles",
  },
  {
    companyName: "Magnet Forensics",
    provider: "lever",
    boardUrl: "https://jobs.lever.co/magnetforensics",
    why: "Canadian company with frontend and remote-Canada roles",
  },
  {
    companyName: "Mejuri",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/mejuri",
    why: "Canadian company with a Toronto frontend role",
  },
  {
    companyName: "Neo Financial",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/neofinancial",
    why: "Canadian company with frontend-leaning roles",
  },
  {
    companyName: "PointClickCare",
    provider: "lever",
    boardUrl: "https://jobs.lever.co/pointclickcare",
    why: "Canadian company with Toronto-area engineering roles",
  },
  {
    companyName: "Procurify",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/procurify",
    why: "Canadian company with remote-Canada roles",
  },
  {
    companyName: "Relay",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/relayfi",
    why: "Canadian company with Toronto frontend-leaning roles",
  },
  {
    companyName: "Solink",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/solink",
    why: "Canadian company with Ottawa engineering roles",
  },
  {
    companyName: "Stay22",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/stay22",
    why: "Canadian company with Montreal engineering roles",
  },
  {
    companyName: "Tailscale",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/tailscale",
    why: "Canadian company with remote-Canada roles",
  },
  {
    companyName: "TribalScale",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/tribalscale",
    why: "Canadian company with Toronto frontend-leaning roles",
  },
  {
    companyName: "Trulioo",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/trulioo",
    why: "Canadian company with Vancouver engineering roles",
  },
  {
    companyName: "Wave",
    provider: "lever",
    boardUrl: "https://jobs.lever.co/waveapps",
    why: "Canadian company with remote-Canada roles",
  },
  {
    companyName: "RBC",
    provider: "workday",
    boardUrl: "https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1",
    why: "Canadian bank on Workday with Toronto engineering roles",
  },
  {
    companyName: "TD",
    provider: "workday",
    boardUrl: "https://td.wd3.myworkdayjobs.com/TD_Bank_Careers",
    why: "Canadian bank on Workday with Toronto frontend roles",
  },
  {
    companyName: "CIBC",
    provider: "workday",
    boardUrl: "https://cibc.wd3.myworkdayjobs.com/search",
    why: "Canadian bank on Workday with Toronto engineering roles",
  },
  {
    companyName: "BMO",
    provider: "workday",
    boardUrl: "https://bmo.wd3.myworkdayjobs.com/External",
    why: "Canadian bank on Workday with Toronto engineering roles",
  },
  {
    companyName: "Manulife",
    provider: "workday",
    boardUrl: "https://manulife.wd3.myworkdayjobs.com/MFCJH_Jobs",
    why: "Canadian insurer on Workday with engineering roles",
  },
  {
    companyName: "Sun Life",
    provider: "workday",
    boardUrl: "https://sunlife.wd3.myworkdayjobs.com/Experienced-Jobs",
    why: "Canadian insurer on Workday with engineering roles",
  },
  {
    companyName: "Thomson Reuters",
    provider: "workday",
    boardUrl: "https://thomsonreuters.wd5.myworkdayjobs.com/External_Career_Site",
    why: "Toronto employer on Workday with software engineering roles",
  },
  {
    companyName: "Affirm",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/affirm",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Anthropic",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/anthropic",
    why: "Remote-friendly board with an Ontario software role",
  },
  {
    companyName: "Asana",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/asana",
    why: "Canada office with frontend-leaning roles",
  },
  {
    companyName: "Block",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/block",
    why: "Toronto office with frontend-leaning roles",
  },
  {
    companyName: "Brex",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/brex",
    why: "Canada office with frontend roles",
  },
  {
    companyName: "Carta",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/carta",
    why: "Toronto office with frontend-leaning roles",
  },
  {
    companyName: "CircleCI",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/circleci",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Coinbase",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/coinbase",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Coursera",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/coursera",
    why: "Toronto office with frontend-leaning roles",
  },
  {
    companyName: "Dialpad",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/dialpad",
    why: "Canada office with frontend-leaning roles",
  },
  {
    companyName: "DoorDash",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/doordashcanada",
    why: "Toronto office with frontend-leaning roles",
  },
  {
    companyName: "Elastic",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/elastic",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Grafana Labs",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/grafanalabs",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Gusto",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/gusto",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Instacart",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/instacart",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Lyft",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/lyft",
    why: "Toronto office with frontend-leaning roles",
  },
  {
    companyName: "Mercury",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/mercury",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "MongoDB",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/mongodb",
    why: "Toronto office with frontend-leaning roles",
  },
  {
    companyName: "Okta",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/okta",
    why: "Toronto office with frontend-leaning roles",
  },
  {
    companyName: "Pinterest",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/pinterest",
    why: "Toronto office with frontend roles",
  },
  {
    companyName: "Ramp",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/ramp",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Reddit",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/reddit",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Robinhood",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/robinhood",
    why: "Toronto office with frontend-leaning roles",
  },
  {
    companyName: "Samsara",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/samsara",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Sentry",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/sentry",
    why: "Toronto office with frontend-leaning roles",
  },
  {
    companyName: "Twilio",
    provider: "greenhouse",
    boardUrl: "https://boards.greenhouse.io/twilio",
    why: "Remote-friendly board with Canada-eligible roles",
  },
  {
    companyName: "Vanta",
    provider: "ashby",
    boardUrl: "https://jobs.ashbyhq.com/vanta",
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
