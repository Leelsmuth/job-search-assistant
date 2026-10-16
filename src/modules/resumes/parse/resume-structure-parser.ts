import OpenAI from "openai";
import {
  parsedResumeSchema,
  sanitizeParsedResume,
  type ParsedResume,
} from "@/modules/resumes/schema/resume-schema";
import {
  RESUME_PARSE_PROMPT_VERSION,
  RESUME_PARSE_SYSTEM_PROMPT,
  buildResumeParseUserPrompt,
} from "@/modules/resumes/schema/resume-parser-prompts";
import {
  buildStrictParsedResumeJsonSchema,
  llmParsedResumeSchema,
} from "@/modules/resumes/schema/llm-resume-schema";
import {
  deterministicPreParse,
  preParseHintsToPartialResume,
} from "./deterministic-pre-parser";
import { detectResumeSections } from "./resume-section-detector";
import type { NormalizedDocument } from "@/modules/resumes/normalize/extracted-document-normalizer";
import { toLineNumberedLayout } from "@/modules/resumes/normalize/extracted-document-normalizer";
import { computeConfidenceScores, mergeWarnings } from "./confidence";
import { getOpenAiModel, isOpenAiConfigured } from "@/lib/env";
import { measureOpenAiCall } from "@/lib/performance/log-ai-run";
import { estimateResumeParseCost } from "./parse-cost";
import { llmResultToParsedResume, verifyParsedResume } from "./verify-parsed-resume";

export type ParseTokenUsage = {
  input: number;
  output: number;
  costUsd: number | null;
};

export type ParseResult = {
  parsed: ParsedResume;
  model: string | null;
  promptVersion: string;
  tokenUsage?: ParseTokenUsage;
  usedRepair: boolean;
  usedHeuristicOnly: boolean;
};

function getClient(): OpenAI | null {
  if (!isOpenAiConfigured()) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function finishHeuristic(parsed: ParsedResume, normalized: NormalizedDocument, extraWarnings: ParsedResume["warnings"] = []): ParsedResume {
  const verified = verifyParsedResume(parsed, normalized.lines);
  verified.warnings = mergeWarnings(verified.warnings, extraWarnings);
  verified.confidence = computeConfidenceScores(verified, verified.warnings);
  return sanitizeParsedResume(parsedResumeSchema.parse(verified));
}

function heuristicParse(normalized: NormalizedDocument, extraWarnings: ParsedResume["warnings"] = []): ParsedResume {
  const sections = detectResumeSections(normalized.lines);
  const hints = deterministicPreParse(sections, { links: normalized.links });
  const partial = preParseHintsToPartialResume(hints);
  return finishHeuristic(partial, normalized, [
    {
      code: "heuristic_fallback",
      message: "Structured parsing used deterministic heuristics only (no AI).",
      fieldPath: null,
    },
    ...extraWarnings,
  ]);
}

const STRICT_RESUME_SCHEMA = buildStrictParsedResumeJsonSchema();

export async function parseResumeStructure(normalized: NormalizedDocument): Promise<ParseResult> {
  const client = getClient();
  if (!client) {
    return {
      parsed: heuristicParse(normalized),
      model: null,
      promptVersion: RESUME_PARSE_PROMPT_VERSION,
      usedRepair: false,
      usedHeuristicOnly: true,
    };
  }

  const numberedLayout = toLineNumberedLayout(normalized.lines);
  const userPrompt = buildResumeParseUserPrompt({
    numberedLayout,
    links: normalized.links.map((link) => link.url),
  });
  const model = getOpenAiModel();

  try {
    const response = await measureOpenAiCall(
      "openai.resume.parse",
      () =>
        client.chat.completions.create({
          model,
          temperature: 0,
          max_tokens: 4096,
          messages: [
            { role: "system", content: RESUME_PARSE_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "parsed_resume",
              strict: true,
              schema: STRICT_RESUME_SCHEMA,
            },
          },
        }),
      { inputChars: userPrompt.length, model }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const llm = llmParsedResumeSchema.parse(JSON.parse(content));
    const verified = verifyParsedResume(llmResultToParsedResume(llm), normalized.lines);
    verified.confidence = computeConfidenceScores(verified, verified.warnings);
    const parsed = sanitizeParsedResume(parsedResumeSchema.parse(verified));
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const usedModel = response.model?.trim() || model;

    return {
      parsed,
      model: usedModel,
      promptVersion: RESUME_PARSE_PROMPT_VERSION,
      tokenUsage: {
        input: inputTokens,
        output: outputTokens,
        costUsd: estimateResumeParseCost(usedModel, inputTokens, outputTokens),
      },
      usedRepair: false,
      usedHeuristicOnly: false,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown AI parse error";
    return {
      parsed: heuristicParse(normalized, [
        {
          code: "ai_parse_failed",
          message: `AI parsing failed; fell back to deterministic parser. ${detail}`,
          fieldPath: null,
        },
      ]),
      model: null,
      promptVersion: RESUME_PARSE_PROMPT_VERSION,
      usedRepair: false,
      usedHeuristicOnly: true,
    };
  }
}
