import type { CompanyJobSource } from "../../../data/company-sources.schema";
import type { candidateProfiles } from "@/db/schema";

type ProfileRow = typeof candidateProfiles.$inferSelect;

export function suggestBoardsForProfile(
  catalog: CompanyJobSource[],
  profile: ProfileRow,
  followingUrls: Set<string>,
  limit = 8
): CompanyJobSource[] {
  const targetTitles = ((profile.targetTitles as string[]) ?? []).map((t) => t.toLowerCase());
  const prefersRemote =
    profile.remotePreference === "remote" || profile.remotePreference === "hybrid";
  const prefersCanada =
    (profile.location ?? "").toLowerCase().includes("canada") ||
    ((profile.preferredLocations as string[]) ?? []).some((l) =>
      l.toLowerCase().includes("canada")
    );

  const scored = catalog
    .filter((entry) => !followingUrls.has(entry.boardUrl))
    .map((entry) => {
      let score = 0;
      const signals = entry.observedSignals;

      if (signals?.hasFrontendJobs) score += 3;
      if (signals?.hasReactJobs) score += 2;
      if (signals?.hasTypeScriptJobs) score += 1;
      if (prefersRemote && signals?.hasRemoteCanadaJobs) score += 4;
      if (prefersCanada && signals?.hasCanadaJobs) score += 2;
      if (entry.headquartersCountry === "CA") score += 2;
      if (entry.industries.includes("devtools")) score += 1;
      if (entry.industries.includes("saas")) score += 1;

      if (targetTitles.length > 0) {
        const nameLower = entry.companyName.toLowerCase();
        if (targetTitles.some((t) => nameLower.includes(t.split(" ")[0]))) score += 1;
      }

      if ((entry.lastJobCount ?? 0) >= 10) score += 1;

      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.companyName.localeCompare(b.entry.companyName));

  return scored.slice(0, limit).map(({ entry }) => entry);
}
