import type { JobSourceProvider, NormalizedJob } from "@/modules/ingestion/types";
import { fetchAdzunaJobs, fetchHimalayasJobs, fetchRemoteOkJobs, fetchRemotiveJobs, fetchWwrJobs } from "./aggregators";
import { fetchJobBankJobs } from "./jobbank";

export async function fetchDiscoveryFeed(provider: JobSourceProvider): Promise<NormalizedJob[]> {
  switch (provider) {
    case "jobbank":
      return fetchJobBankJobs();
    case "remotive":
      return fetchRemotiveJobs();
    case "weworkremotely":
      return fetchWwrJobs();
    case "himalayas":
      return fetchHimalayasJobs();
    case "remoteok":
      return fetchRemoteOkJobs();
    case "adzuna":
      return fetchAdzunaJobs();
    default:
      return [];
  }
}
