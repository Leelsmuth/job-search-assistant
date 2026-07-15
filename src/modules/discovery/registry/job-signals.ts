import type { NormalizedJob } from "@/modules/ingestion/types";
import type { ObservedSignals } from "../../../../data/company-sources.schema";

const CANADA_LOCATION_PATTERNS = [
  /\bcanada\b/i,
  /\bremote\s*[-–—]?\s*canada\b/i,
  /\bcanada\s*remote\b/i,
  /\bremote\s+canada\b/i,
  /\bontario\b/i,
  /\btoronto\b/i,
  /\bvancouver\b/i,
  /\bbritish columbia\b/i,
  /\balberta\b/i,
  /\bcalgary\b/i,
  /\bmontreal\b/i,
  /\bmontréal\b/i,
  /\bquebec\b/i,
  /\bquébec\b/i,
  /\bottawa\b/i,
  /\bwaterloo\b/i,
  /\bkitchener\b/i,
  /\bhamilton\b/i,
];

const REMOTE_CANADA_PATTERNS = [
  /\bremote\s*[-–—]?\s*canada\b/i,
  /\bcanada\s*remote\b/i,
  /\bremote\s+canada\b/i,
  /\bcanada\s*only\b/i,
  /\bremote\s+in\s+canada\b/i,
];

const REMOTE_GLOBAL_PATTERNS = [
  /\bremote\b/i,
  /\bwork from anywhere\b/i,
  /\banywhere in the world\b/i,
  /\bglobally remote\b/i,
];

const FRONTEND_TITLE_PATTERNS = [
  /\bfrontend engineer\b/i,
  /\bfront[\s-]?end engineer\b/i,
  /\bfrontend developer\b/i,
  /\bfront[\s-]?end developer\b/i,
  /\bui engineer\b/i,
  /\bweb engineer\b/i,
  /\bsoftware engineer[,\s-]+frontend\b/i,
  /\bsoftware engineer\s*-\s*frontend\b/i,
  /\bproduct engineer\b/i,
];

const REACT_PATTERNS = [/\breact\b/i, /\breact\.js\b/i, /\bnext\.js\b/i];
const TYPESCRIPT_PATTERNS = [/\btypescript\b/i, /\bts\b/i];

export type LocationRemoteClass =
  | "remote-global"
  | "remote-canada"
  | "remote-us"
  | "remote-region-specific"
  | "remote-unknown"
  | "onsite"
  | "hybrid"
  | "unknown";

export function classifyJobLocation(job: NormalizedJob): LocationRemoteClass {
  const locationText = `${job.location ?? ""} ${job.description.slice(0, 800)}`;

  if (REMOTE_CANADA_PATTERNS.some((p) => p.test(locationText))) {
    return "remote-canada";
  }

  const isCanada = CANADA_LOCATION_PATTERNS.some((p) => p.test(locationText));
  const isRemote =
    job.workplaceType === "remote" || REMOTE_GLOBAL_PATTERNS.some((p) => p.test(locationText));

  if (isRemote && /\b(us only|united states only|us-based)\b/i.test(locationText)) {
    return "remote-us";
  }
  if (isRemote && isCanada) return "remote-canada";
  if (isRemote && /\b(europe|emea|apac|uk only|latam)\b/i.test(locationText)) {
    return "remote-region-specific";
  }
  if (isRemote) return "remote-unknown";
  if (job.workplaceType === "hybrid") return "hybrid";
  if (isCanada) return "onsite";
  return "unknown";
}

function jobText(job: NormalizedJob): string {
  return `${job.title} ${job.description} ${(job.technologies ?? []).join(" ")}`;
}

function isFrontendJob(job: NormalizedJob): boolean {
  const title = job.title;
  if (FRONTEND_TITLE_PATTERNS.some((p) => p.test(title))) return true;
  const text = jobText(job);
  const hasReact = REACT_PATTERNS.some((p) => p.test(text));
  const hasTs = TYPESCRIPT_PATTERNS.some((p) => p.test(text));
  const hasFrontendTitle =
    /\b(frontend|front-end|front end|ui engineer|web engineer)\b/i.test(title);
  return hasFrontendTitle && (hasReact || hasTs);
}

function hasReactSignal(job: NormalizedJob): boolean {
  return REACT_PATTERNS.some((p) => p.test(jobText(job)));
}

function hasTypeScriptSignal(job: NormalizedJob): boolean {
  return TYPESCRIPT_PATTERNS.some((p) => p.test(jobText(job)));
}

function isCanadaJob(job: NormalizedJob): boolean {
  const locationText = `${job.location ?? ""} ${job.description.slice(0, 500)}`;
  return CANADA_LOCATION_PATTERNS.some((p) => p.test(locationText));
}

function isRemoteCanadaJob(job: NormalizedJob): boolean {
  return classifyJobLocation(job) === "remote-canada";
}

function isRemoteJob(job: NormalizedJob): boolean {
  const cls = classifyJobLocation(job);
  return (
    cls === "remote-global" ||
    cls === "remote-canada" ||
    cls === "remote-us" ||
    cls === "remote-region-specific" ||
    cls === "remote-unknown"
  );
}

export function extractObservedSignals(jobs: NormalizedJob[]): ObservedSignals {
  let frontendJobCount = 0;
  let reactJobCount = 0;
  let typescriptJobCount = 0;
  let canadaJobCount = 0;
  let remoteCanadaJobCount = 0;

  for (const job of jobs) {
    if (isFrontendJob(job)) frontendJobCount++;
    if (hasReactSignal(job)) reactJobCount++;
    if (hasTypeScriptSignal(job)) typescriptJobCount++;
    if (isCanadaJob(job)) canadaJobCount++;
    if (isRemoteCanadaJob(job)) remoteCanadaJobCount++;
  }

  return {
    hasCanadaJobs: canadaJobCount > 0,
    hasRemoteCanadaJobs: remoteCanadaJobCount > 0,
    hasFrontendJobs: frontendJobCount > 0,
    hasReactJobs: reactJobCount > 0,
    hasTypeScriptJobs: typescriptJobCount > 0,
    hasRemoteJobs: jobs.some(isRemoteJob),
    frontendJobCount,
    reactJobCount,
    typescriptJobCount,
    canadaJobCount,
    remoteCanadaJobCount,
    analyzedAt: new Date().toISOString(),
  };
}
