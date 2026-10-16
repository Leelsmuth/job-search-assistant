import { clipText } from "@/modules/documents/text";
import type { ResumeChange, TailoredResumeDraft } from "@/modules/documents/types";
import type { ResumeSuggestion } from "@/modules/resume-score/types";

/**
 * Accepted, already-verified rewrites become accepted bullet changes on the
 * tailored resume draft. Omitted bullets are included so the keyword is exported.
 */
export function applyAcceptedResumeSuggestions(
  draft: TailoredResumeDraft,
  accepted: ReadonlyArray<Pick<ResumeSuggestion, "bulletId" | "suggestedText">>
): TailoredResumeDraft {
  const byId = new Map(
    accepted
      .map((item) => [item.bulletId, item.suggestedText.trim()] as const)
      .filter(([, text]) => text.length > 0)
  );
  if (byId.size === 0) return draft;

  const experiences = draft.experiences.map((experience) => {
    const bullets = experience.bullets.map((bullet) => {
      const next = byId.get(bullet.id);
      if (!next || next === bullet.originalText.trim()) return bullet;
      return {
        ...bullet,
        suggestedText: next,
        editedText: next,
        proposedIncluded: true,
        unsupportedClaims: [] as string[],
      };
    });
    const touched = bullets.some((bullet) => byId.has(bullet.id) && bullet.suggestedText.trim() !== bullet.originalText.trim());
    return {
      ...experience,
      proposedIncluded: touched ? true : experience.proposedIncluded,
      bullets,
    };
  });

  const replaced = new Set(
    [...byId.keys()].map((bulletId) => `rewrite-bullet:${bulletId}`)
  );
  const changes: ResumeChange[] = draft.changes.filter((change) => !replaced.has(change.id));
  for (const experience of experiences) {
    for (const bullet of experience.bullets) {
      if (!byId.has(bullet.id) || bullet.suggestedText.trim() === bullet.originalText.trim()) continue;
      changes.push({
        id: `rewrite-bullet:${bullet.id}`,
        kind: "rewrite_bullet",
        label: `Rewrite bullet at ${experience.company}`,
        before: clipText(bullet.originalText),
        after: clipText(bullet.suggestedText),
        decision: "accepted",
        targetIds: [bullet.id],
      });
    }
  }

  return {
    ...draft,
    generationMode: "llm",
    experiences,
    changes,
    unsupportedClaims: draft.unsupportedClaims,
  };
}
