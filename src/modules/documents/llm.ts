import OpenAI from "openai";
import { z } from "zod";
import { getOpenAiApiKey, getOpenAiModel, isOpenAiConfigured } from "@/lib/env";
import { measureOpenAiCall } from "@/lib/performance/log-ai-run";
import type { JobTailoringContext, ProfileSnapshot, TailoredResumeDraft } from "@/modules/documents/types";

const MINI_INPUT_USD = 0.15 / 1_000_000;
const MINI_OUTPUT_USD = 0.6 / 1_000_000;

export const RESUME_REWRITE_PROMPT = "resume.tailor_document.v1";
export const COVER_LETTER_PROMPT = "cover_letter.generate.v1";

export type LlmMeta = {
  model: string | null;
  promptVersion: string;
  tokenInputCount: number | null;
  tokenOutputCount: number | null;
  costEstimate: number | null;
  fallbackReason: string | null;
  error: string | null;
};

const rewriteSchema = z.object({
  bullets: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
});

const letterSchema = z.object({
  letter: z.string().min(1),
});

function emptyMeta(promptVersion: string, fallbackReason: string, error: string | null = null): LlmMeta {
  return {
    model: null,
    promptVersion,
    tokenInputCount: null,
    tokenOutputCount: null,
    costEstimate: null,
    fallbackReason,
    error,
  };
}

function costFor(model: string, input: number, output: number): number | null {
  if (!model.includes("gpt-4o-mini")) return null;
  return input * MINI_INPUT_USD + output * MINI_OUTPUT_USD;
}

function client(): OpenAI | null {
  const key = getOpenAiApiKey();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function completeJson(
  operation: string,
  system: string,
  user: string
): Promise<{ json: unknown; meta: Omit<LlmMeta, "promptVersion" | "fallbackReason" | "error"> } | null> {
  const openai = client();
  if (!openai) return null;
  const model = getOpenAiModel();
  const response = await measureOpenAiCall(
    operation,
    () =>
      openai.chat.completions.create({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    { inputChars: user.length, model }
  );
  const content = response.choices[0]?.message?.content;
  if (!content) return null;
  const usedModel = response.model?.trim() || model;
  const tokenInputCount = response.usage?.prompt_tokens ?? null;
  const tokenOutputCount = response.usage?.completion_tokens ?? null;
  return {
    json: JSON.parse(content) as unknown,
    meta: {
      model: usedModel,
      tokenInputCount,
      tokenOutputCount,
      costEstimate:
        tokenInputCount != null && tokenOutputCount != null
          ? costFor(usedModel, tokenInputCount, tokenOutputCount)
          : null,
    },
  };
}

export async function rewriteBulletsWithLlm(
  draft: TailoredResumeDraft,
  job: JobTailoringContext
): Promise<{ rewrites: Array<{ id: string; text: string }>; meta: LlmMeta }> {
  const bullets = draft.experiences
    .flatMap((experience) =>
      experience.bullets
        .filter((bullet) => bullet.proposedIncluded)
        .map((bullet) => ({
          id: bullet.id,
          text: bullet.originalText,
          company: experience.company,
          title: experience.title,
          score: bullet.score,
        }))
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ score: _score, ...bullet }) => bullet);

  if (!isOpenAiConfigured()) {
    return { rewrites: [], meta: emptyMeta(RESUME_REWRITE_PROMPT, "OPENAI_API_KEY missing") };
  }
  if (bullets.length === 0) {
    return { rewrites: [], meta: emptyMeta(RESUME_REWRITE_PROMPT, "no_bullets") };
  }

  try {
    const result = await completeJson(
      "openai.resume.tailor_document",
      `Rewrite resume bullets for one job. Canadian English.
Use ONLY facts already in each bullet. You may change emphasis and order of existing facts.
Do not add employers, job titles, dates, numbers, metrics, tools, or skills that are not already in that bullet.
Do not copy facts from a different bullet.
If you cannot improve a bullet without adding facts, return its original text.
Return JSON: {"bullets":[{"id":"...","text":"..."}]}
Prompt version: ${RESUME_REWRITE_PROMPT}`,
      JSON.stringify({
        jobTitle: job.title,
        company: job.companyName,
        technologies: job.technologies.slice(0, 20),
        requirements: job.requirements.slice(0, 20),
        description: job.description.slice(0, 4000),
        bullets,
      })
    );
    if (!result) {
      return { rewrites: [], meta: emptyMeta(RESUME_REWRITE_PROMPT, "empty_response") };
    }
    const parsed = rewriteSchema.safeParse(result.json);
    return {
      rewrites: parsed.success ? parsed.data.bullets : [],
      meta: {
        ...result.meta,
        promptVersion: RESUME_REWRITE_PROMPT,
        fallbackReason: parsed.success ? null : "invalid_json",
        error: null,
      },
    };
  } catch (error) {
    return {
      rewrites: [],
      meta: {
        ...emptyMeta(
          RESUME_REWRITE_PROMPT,
          "llm_error",
          error instanceof Error ? error.message : "OpenAI request failed"
        ),
        model: getOpenAiModel(),
      },
    };
  }
}

export async function draftCoverLetterWithLlm(
  profile: ProfileSnapshot,
  job: JobTailoringContext
): Promise<{ letter: string | null; meta: LlmMeta }> {
  if (!isOpenAiConfigured()) {
    return { letter: null, meta: emptyMeta(COVER_LETTER_PROMPT, "OPENAI_API_KEY missing") };
  }

  try {
    const result = await completeJson(
      "openai.cover_letter.generate",
      `Write a cover letter of 250-350 words in Canadian English for a frontend candidate targeting remote roles in Canada and hybrid roles in the Toronto area.
Use ONLY the profile facts provided. Do not invent employers, titles, dates, metrics, or skills.
Mention the target company and job title. Do not claim the candidate currently holds that title unless the profile says so.
Return JSON: {"letter":"..."}
Prompt version: ${COVER_LETTER_PROMPT}`,
      JSON.stringify({
        jobTitle: job.title,
        company: job.companyName,
        description: job.description.slice(0, 4000),
        profile: {
          name: profile.displayName,
          location: profile.location,
          summary: profile.summary,
          yearsExperience: profile.yearsExperience,
          skills: profile.skills.map((skill) => skill.name),
          experiences: profile.experiences.map((experience) => ({
            company: experience.company,
            title: experience.title,
            startDate: experience.startDate,
            endDate: experience.endDate,
            bullets: experience.bullets.map((bullet) => bullet.text),
          })),
          projects: profile.projects.map((project) => ({
            name: project.name,
            description: project.description,
            skills: project.skills,
          })),
          education: profile.education,
          certifications: profile.certifications,
        },
      })
    );
    if (!result) {
      return { letter: null, meta: emptyMeta(COVER_LETTER_PROMPT, "empty_response") };
    }
    const parsed = letterSchema.safeParse(result.json);
    return {
      letter: parsed.success ? parsed.data.letter : null,
      meta: {
        ...result.meta,
        promptVersion: COVER_LETTER_PROMPT,
        fallbackReason: parsed.success ? null : "invalid_json",
        error: null,
      },
    };
  } catch (error) {
    return {
      letter: null,
      meta: {
        ...emptyMeta(
          COVER_LETTER_PROMPT,
          "llm_error",
          error instanceof Error ? error.message : "OpenAI request failed"
        ),
        model: getOpenAiModel(),
      },
    };
  }
}
