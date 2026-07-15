export function isAnalysisStale(
  analysisCreatedAt: Date | string,
  profileUpdatedAt: Date | string | null | undefined
): boolean {
  if (!profileUpdatedAt) return false;
  const analysisTime = new Date(analysisCreatedAt).getTime();
  const profileTime = new Date(profileUpdatedAt).getTime();
  return profileTime > analysisTime;
}

export const MATCH_ANALYSIS_VERSION = "v2";
