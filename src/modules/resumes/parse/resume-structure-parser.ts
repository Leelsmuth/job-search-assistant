import OpenAI from "openai";
import { z } from "zod";
import {
  parsedResumeSchema,
  type ParsedResume,
  sanitizeParsedResume,
} from "@/modules/resumes/schema/resume-schema";
import {
  RESUME_PARSE_PROMPT_VERSION,
  RESUME_PARSE_REPAIR_PROMPT,
  RESUME_PARSE_SYSTEM_PROMPT,
  buildResumeParseUserPrompt,
} from "@/modules/resumes/schema/resume-parser-prompts";
import {
  deterministicPreParse,
  preParseHintsToPartialResume,
} from "./deterministic-pre-parser";
import {
  detectResumeSections,
  sectionsToOutline,
} from "./resume-section-detector";
import type { NormalizedDocument } from "@/modules/resumes/normalize/extracted-document-normalizer";
import { computeConfidenceScores, mergeWarnings } from "./confidence";

function isOpenAiConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return false;
  if (/your-key|placeholder|changeme|xxx/i.test(key)) return false;
  return key.startsWith("sk-");
}

const openai = isOpenAiConfigured()
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export type ParseResult = {
  parsed: ParsedResume;
  model: string | null;
  promptVersion: string;
  tokenUsage?: { input: number; output: number };
  usedRepair: boolean;
  usedHeuristicOnly: boolean;
};

function heuristicParse(normalized: NormalizedDocument): ParsedResume {
  const sections = detectResumeSections(normalized.lines);
  const hints = deterministicPreParse(sections);
  const partial = preParseHintsToPartialResume(hints);
  const warnings = mergeWarnings(partial.warnings, [
    {
      code: "heuristic_fallback",
      message: "Structured parsing used deterministic heuristics only (no AI).",
      fieldPath: null,
    },
  ]);
  partial.warnings = warnings;
  partial.confidence = computeConfidenceScores(partial, warnings);
  return sanitizeParsedResume(parsedResumeSchema.parse(partial));
}

async function callOpenAiParse(
  normalized: NormalizedDocument,
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string; model: string; usage?: { input: number; output: number } }> {
  if (!openai) throw new Error("OpenAI not configured");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");

  return {
    content,
    model: response.model,
    usage: {
      input: response.usage?.prompt_tokens ?? 0,
      output: response.usage?.completion_tokens ?? 0,
    },
  };
}

export async function parseResumeStructure(
  normalized: NormalizedDocument
): Promise<ParseResult> {
  const sections = detectResumeSections(normalized.lines);
  const hints = deterministicPreParse(sections);
  const partial = preParseHintsToPartialResume(hints);

  if (!openai) {
    const parsed = heuristicParse(normalized);
    return {
      parsed,
      model: null,
      promptVersion: RESUME_PARSE_PROMPT_VERSION,
      usedRepair: false,
      usedHeuristicOnly: true,
    };
  }

  const userPrompt = buildResumeParseUserPrompt({
    normalizedText: normalized.normalizedText,
    sectionOutline: sectionsToOutline(sections),
    preParseJson: JSON.stringify(partial, null, 0),
  });

  try {
    const first = await callOpenAiParse(
      normalized,
      RESUME_PARSE_SYSTEM_PROMPT,
      userPrompt
    );

    try {
      const parsed = sanitizeParsedResume(
        parsedResumeSchema.parse(JSON.parse(first.content))
      );
      parsed.confidence = computeConfidenceScores(parsed, parsed.warnings);
      return {
        parsed,
        model: first.model,
        promptVersion: RESUME_PARSE_PROMPT_VERSION,
        tokenUsage: first.usage,
        usedRepair: false,
        usedHeuristicOnly: false,
      };
    } catch (validationError) {
      const zodError =
        validationError instanceof z.ZodError
          ? validationError.flatten()
          : { formErrors: [String(validationError)] };

      const repairPrompt = `${userPrompt}

Validation errors:
${JSON.stringify(zodError)}

Return corrected JSON only.`;

      const repair = await callOpenAiParse(
        normalized,
        RESUME_PARSE_REPAIR_PROMPT,
        repairPrompt
      );

      const parsed = sanitizeParsedResume(
        parsedResumeSchema.parse(JSON.parse(repair.content))
      );
      parsed.warnings = mergeWarnings(parsed.warnings, [
        {
          code: "schema_repair",
          message: "Initial parse required schema repair.",
          fieldPath: null,
        },
      ]);
      parsed.confidence = computeConfidenceScores(parsed, parsed.warnings);

      return {
        parsed,
        model: repair.model,
        promptVersion: RESUME_PARSE_PROMPT_VERSION,
        tokenUsage: repair.usage,
        usedRepair: true,
        usedHeuristicOnly: false,
      };
    }
  } catch {
    const parsed = heuristicParse(normalized);
    parsed.warnings = mergeWarnings(parsed.warnings, [
      {
        code: "ai_parse_failed",
        message: "AI parsing failed; fell back to deterministic parser.",
        fieldPath: null,
      },
    ]);
    parsed.confidence = computeConfidenceScores(parsed, parsed.warnings);
    return {
      parsed,
      model: null,
      promptVersion: RESUME_PARSE_PROMPT_VERSION,
      usedRepair: false,
      usedHeuristicOnly: true,
    };
  }
}
