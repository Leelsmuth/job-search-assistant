export type RequirementMatchRow = {
  id: string;
  matchStatus: string;
  explanation: string | null;
  requirement?: { text?: string | null } | null;
};

export type GroupedRequirementMatches = {
  strong: RequirementMatchRow[];
  partial: RequirementMatchRow[];
  gaps: RequirementMatchRow[];
  blockers: RequirementMatchRow[];
};

export function groupRequirementMatches(
  matches: RequirementMatchRow[]
): GroupedRequirementMatches {
  const strong: RequirementMatchRow[] = [];
  const partial: RequirementMatchRow[] = [];
  const gaps: RequirementMatchRow[] = [];
  const blockers: RequirementMatchRow[] = [];

  for (const match of matches) {
    switch (match.matchStatus) {
      case "confirmed":
        strong.push(match);
        break;
      case "transferable":
        partial.push(match);
        break;
      case "blocked":
        blockers.push(match);
        break;
      case "gap":
      case "missing_evidence":
        gaps.push(match);
        break;
    }
  }

  return { strong, partial, gaps, blockers };
}
