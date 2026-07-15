import { z } from "zod";

export const tailoringSuggestionSchema = z.object({
  suggestionType: z.enum(["rewrite", "emphasize", "reorder"]).default("rewrite"),
  bulletId: z.string().uuid(),
  originalText: z.string().min(1),
  suggestedText: z.string().min(1),
  evidenceId: z.string().uuid().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const tailoringSuggestionsResponseSchema = z.object({
  suggestions: z.array(tailoringSuggestionSchema),
});

export type TailoringSuggestionInput = z.infer<typeof tailoringSuggestionSchema>;

export const draftAnswerResponseSchema = z.object({
  answer: z.string().min(1),
  evidenceIds: z.array(z.string()).default([]),
  unsupportedClaims: z.array(z.string()).default([]),
});

export type DraftAnswerResult = z.infer<typeof draftAnswerResponseSchema>;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

export function hasSubstantialOverlap(original: string, suggested: string): boolean {
  const origTokens = tokenize(original);
  const suggTokens = tokenize(suggested);
  if (origTokens.size === 0 || suggTokens.size === 0) return false;
  let overlap = 0;
  for (const t of origTokens) {
    if (suggTokens.has(t)) overlap++;
  }
  return overlap / origTokens.size >= 0.3;
}

export function validateTailoringSuggestions(
  raw: unknown,
  bulletIds: Set<string>,
  evidenceIds: Set<string>,
  bulletsById: Map<string, string>
): TailoringSuggestionInput[] {
  const parsed = z.array(tailoringSuggestionSchema).safeParse(
    Array.isArray(raw) ? raw : (raw as { suggestions?: unknown })?.suggestions ?? []
  );
  if (!parsed.success) return [];

  return parsed.data.filter((s) => {
    if (!bulletIds.has(s.bulletId)) return false;
    if (s.evidenceId && !evidenceIds.has(s.evidenceId)) return false;
    const bulletText = bulletsById.get(s.bulletId);
    if (!bulletText) return false;
    if (s.originalText.trim() !== bulletText.trim()) {
      s.originalText = bulletText;
    }
    return hasSubstantialOverlap(bulletText, s.suggestedText);
  });
}

export function validateDraftAnswerResponse(
  raw: unknown,
  validEvidenceIds: Set<string>,
  evidenceById: Map<string, string>,
  jobDescription: string
): DraftAnswerResult {
  const parsed = draftAnswerResponseSchema.safeParse(
    typeof raw === "object" && raw !== null && "answer" in raw
      ? raw
      : { answer: String(raw ?? ""), evidenceIds: [], unsupportedClaims: [] }
  );
  if (!parsed.success) {
    return { answer: "", evidenceIds: [], unsupportedClaims: ["Invalid draft format"] };
  }

  const evidenceIds = parsed.data.evidenceIds.filter((id) => validEvidenceIds.has(id));
  const citedTexts = evidenceIds
    .map((id) => evidenceById.get(id))
    .filter(Boolean) as string[];

  const unsupportedClaims = [
    ...parsed.data.unsupportedClaims,
    ...detectUnsupportedClaims(parsed.data.answer, citedTexts, jobDescription),
  ];

  return {
    answer: parsed.data.answer,
    evidenceIds,
    unsupportedClaims: [...new Set(unsupportedClaims)].filter(Boolean),
  };
}

const CLAIM_PATTERNS = [
  /\b(\d+\+?\s*years?\s+(?:of\s+)?experience)\b/gi,
  /\b(led|managed|architected|built|shipped)\b[^.!?]{0,80}/gi,
];

export function detectUnsupportedClaims(
  answer: string,
  citedEvidenceTexts: string[],
  jobDescription: string
): string[] {
  const claims: string[] = [];
  const evidenceLower = citedEvidenceTexts.join(" ").toLowerCase();
  const answerLower = answer.toLowerCase();

  for (const pattern of CLAIM_PATTERNS) {
    for (const match of answer.matchAll(pattern)) {
      const phrase = match[0].trim();
      if (phrase.length > 8 && !evidenceLower.includes(phrase.toLowerCase().slice(0, 20))) {
        claims.push(`Verify claim: "${phrase.slice(0, 60)}${phrase.length > 60 ? "…" : ""}"`);
      }
    }
  }

  const jobTechs = jobDescription
    .toLowerCase()
    .match(/\b(react|typescript|graphql|kubernetes|java|python|aws|node\.?js)\b/g);
  if (jobTechs) {
    for (const tech of new Set(jobTechs)) {
      if (answerLower.includes(tech) && !evidenceLower.includes(tech)) {
        claims.push(`"${tech}" mentioned in answer but not in cited evidence`);
      }
    }
  }

  return claims.slice(0, 5);
}
