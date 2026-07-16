import { createHash } from "crypto";
import { MATCH_ANALYSIS_VERSION } from "@/modules/matching/stale";

export function computeMatchAnalysisInputHash(input: {
  jobDescriptionHash: string | null;
  profileUpdatedAt: Date | string | null | undefined;
  analysisVersion?: string;
}): string {
  const profileTime = input.profileUpdatedAt
    ? new Date(input.profileUpdatedAt).toISOString()
    : "none";
  const payload = [
    input.jobDescriptionHash ?? "none",
    profileTime,
    input.analysisVersion ?? MATCH_ANALYSIS_VERSION,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}
