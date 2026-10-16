import OpenAI from "openai";
import { z } from "zod";
import { getOpenAiApiKey, getOpenAiModel, isOpenAiConfigured } from "@/lib/env";
import { measureOpenAiCall } from "@/lib/performance/log-ai-run";
import { finalizeResumeSuggestions } from "@/modules/resume-score/verify-suggestions";
import {
  RESUME_SUGGESTION_PROMPT,
  type RawResumeSuggestion,
  type ResumeScoreEvidence,
  type ResumeSuggestion,
} from "@/modules/resume-score/types";

const MINI_INPUT_USD = 0.15 / 1_000_000;
const MINI_OUTPUT_USD = 0.6 / 1_000_000;

const responseSchema = z.object({
  suggestions: z.array(
    z.object({
      bulletId: z.string(),
      originalText: z.string(),
      suggestedText: z.string(),
      keywords: z.array(z.string()),
      evidenceIds: z.array(z.string()),
    })
  ),
});

export const RESUME_SUGGESTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["bulletId", "originalText", "suggestedText", "keywords", "evidenceIds"],
        properties: {
          bulletId: { type: "string" },
          originalText: { type: "string" },
          suggestedText: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export type SuggestionCallResult = {
  suggestions: ResumeSuggestion[];
  model: string | null;
  tokenInputCount: number | null;
  tokenOutputCount: number | null;
  costEstimate: number | null;
  error: string | null;
  fallbackReason: string | null;
};

export type SuggestionBullet = {
  id: string;
  text: string;
  company: string;
  title: string;
};

export type SuggestionRequest = {
  jobTitle: string;
  companyName: string | null;
  keywords: Array<{ term: string; evidenceId: string | null; evidenceText: string }>;
  bullets: SuggestionBullet[];
  evidence: ResumeScoreEvidence[];
  profileSkills: string[];
};

function emptyResult(fallbackReason: string, error: string | null = null): SuggestionCallResult {
  return {
    suggestions: [],
    model: null,
    tokenInputCount: null,
    tokenOutputCount: null,
    costEstimate: null,
    error,
    fallbackReason,
  };
}

export function estimateSuggestionCost(model: string, input: number, output: number): number | null {
  if (!model.includes("gpt-4o-mini")) return null;
  return input * MINI_INPUT_USD + output * MINI_OUTPUT_USD;
}

function verified(
  raw: RawResumeSuggestion[],
  request: SuggestionRequest
): ResumeSuggestion[] {
  return finalizeResumeSuggestions(raw, {
    bullets: request.bullets.map((bullet) => ({ id: bullet.id, text: bullet.text })),
    evidence: request.evidence,
    profileSkills: request.profileSkills,
  });
}

export async function requestResumeSuggestions(request: SuggestionRequest): Promise<SuggestionCallResult> {
  const keywords = request.keywords.filter((keyword) => keyword.term.trim()).slice(0, 10);
  const bullets = request.bullets.slice(0, 8);
  if (keywords.length === 0 || bullets.length === 0) {
    return emptyResult("no_supported_keywords");
  }
  if (!isOpenAiConfigured()) return emptyResult("OPENAI_API_KEY missing");

  const apiKey = getOpenAiApiKey();
  if (!apiKey) return emptyResult("OPENAI_API_KEY missing");
  const model = getOpenAiModel();
  const user = JSON.stringify({
    jobTitle: request.jobTitle,
    company: request.companyName,
    keywords,
    bullets,
  });

  try {
    const openai = new OpenAI({ apiKey });
    const response = await measureOpenAiCall(
      "openai.resume.ats_suggestions",
      () =>
        openai.chat.completions.create(
          {
            model,
            temperature: 0,
            messages: [
              {
                role: "system",
                content: `Rewrite resume bullets so they mention supported keywords that are missing from the resume.
Use ONLY facts from that bullet and the cited evidence. Canadian English.
Do not add employers, job titles, dates, numbers, or skills that are not in the bullet or the evidence.
Every keyword must be one of the supported keywords and must be cited with an evidence id from that keyword.
If you cannot improve a bullet without inventing a fact, omit it.
Prompt version: ${RESUME_SUGGESTION_PROMPT}`,
              },
              { role: "user", content: user },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "resume_ats_suggestions",
                strict: true,
                schema: RESUME_SUGGESTION_JSON_SCHEMA,
              },
            },
          },
          { timeout: 12000 }
        ),
      { inputChars: user.length, model }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return emptyResult("empty_response");
    const parsed = responseSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return emptyResult("invalid_json");
    const usedModel = response.model?.trim() || model;
    const tokenInputCount = response.usage?.prompt_tokens ?? null;
    const tokenOutputCount = response.usage?.completion_tokens ?? null;
    return {
      suggestions: verified(parsed.data.suggestions, request),
      model: usedModel,
      tokenInputCount,
      tokenOutputCount,
      costEstimate:
        tokenInputCount != null && tokenOutputCount != null
          ? estimateSuggestionCost(usedModel, tokenInputCount, tokenOutputCount)
          : null,
      error: null,
      fallbackReason: null,
    };
  } catch (error) {
    return {
      ...emptyResult("llm_error", error instanceof Error ? error.message : "OpenAI request failed"),
      model,
    };
  }
}
