import type { AtsProvider, VerificationStatus } from "../../../../data/company-sources.schema";
import { normalizeBoardUrl } from "@/modules/ingestion/board-url";
import { getAdapterForProvider } from "@/modules/ingestion/adapters";
import { normalizeBoardJobs } from "@/modules/ingestion/board-normalize";
import type { NormalizedJob } from "@/modules/ingestion/types";
import { extractObservedSignals } from "./job-signals";

export type BoardVerificationResult = {
  status: VerificationStatus;
  jobCount: number;
  jobs: NormalizedJob[];
  observedSignals?: ReturnType<typeof extractObservedSignals>;
  boardUrl: string;
  companyName?: string;
  error?: string;
};

export async function verifyBoard(
  boardUrl: string,
  provider: AtsProvider,
  options?: { timeoutMs?: number }
): Promise<BoardVerificationResult> {
  const timeoutMs = options?.timeoutMs ?? 15_000;

  try {
    const parsed = normalizeBoardUrl(boardUrl, provider);
    const adapter = getAdapterForProvider(parsed.provider);
    if (!adapter) {
      return {
        status: "verification_failed",
        jobCount: 0,
        jobs: [],
        boardUrl: parsed.boardUrl,
        error: "No adapter for provider",
      };
    }

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
    });

    let rawSource;
    try {
      rawSource = await Promise.race([adapter.fetch(parsed.boardUrl), timeout]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timed out/i.test(message)) {
        return {
          status: "unavailable",
          jobCount: 0,
          jobs: [],
          boardUrl: parsed.boardUrl,
          error: message,
        };
      }
      if (/404|not found/i.test(message)) {
        return {
          status: "invalid",
          jobCount: 0,
          jobs: [],
          boardUrl: parsed.boardUrl,
          error: message,
        };
      }
      if (/429|rate limit/i.test(message)) {
        return {
          status: "rate_limited",
          jobCount: 0,
          jobs: [],
          boardUrl: parsed.boardUrl,
          error: message,
        };
      }
      return {
        status: "verification_failed",
        jobCount: 0,
        jobs: [],
        boardUrl: parsed.boardUrl,
        error: message,
      };
    }

    const jobs = normalizeBoardJobs(rawSource);
    if (jobs.length === 0) {
      return {
        status: "empty",
        jobCount: 0,
        jobs: [],
        boardUrl: parsed.boardUrl,
        error: "Board returned 0 published jobs",
      };
    }

    const companyName = jobs[0]?.company;
    const observedSignals = extractObservedSignals(jobs);

    return {
      status: "verified",
      jobCount: jobs.length,
      jobs,
      observedSignals,
      boardUrl: parsed.boardUrl,
      companyName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "verification_failed",
      jobCount: 0,
      jobs: [],
      boardUrl,
      error: message,
    };
  }
}

export function isActiveVerifiedStatus(status: VerificationStatus): boolean {
  return status === "verified";
}
