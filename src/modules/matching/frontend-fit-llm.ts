import OpenAI from "openai";
import { z } from "zod";
import { isOpenAiConfigured } from "@/lib/env";
import {
  scoreFrontendFit,
  type FrontendFitJob,
  type FrontendFitProfile,
  type FrontendFitResult,
} from "@/modules/matching/frontend-fit";

const enhancementSchema = z.object({
  scoreDelta: z.number().min(-5).max(5),
  reasons: z.array(z.string().min(1).max(160)).max(4),
});

export type EnhancedFrontendFit = FrontendFitResult & {
  enhanced: boolean;
  note: string | null;
};

export function isFrontendFitAiAvailable(): boolean {
  return isOpenAiConfigured();
}

function unchanged(result: FrontendFitResult): EnhancedFrontendFit {
  return { ...result, enhanced: false, note: null };
}

/**
 * Optional gpt-4o-mini pass. The deterministic score remains the source of truth;
 * the model may only nudge it by 5 points and rewrite the short reasons.
 */
export async function maybeEnhanceFrontendFit(
  job: FrontendFitJob,
  profile: FrontendFitProfile = {},
  deterministic: FrontendFitResult = scoreFrontendFit(job, profile)
): Promise<EnhancedFrontendFit> {
  if (!isFrontendFitAiAvailable()) return unchanged(deterministic);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You adjust a deterministic frontend-role fit score for a Canadian citizen targeting frontend and frontend-leaning work.
Return JSON: {"scoreDelta": number between -5 and 5, "reasons": string[1-4]}.
Do not invent requirements that are not in the posting. Keep each reason under 140 characters.
scoreDelta 0 and the provided reasons are correct when you are unsure.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              title: job.title,
              technologies: job.technologies ?? [],
              salary: {
                min: job.salaryMin ?? null,
                max: job.salaryMax ?? null,
                currency: job.salaryCurrency ?? null,
              },
              excerpt: (job.description ?? "").slice(0, 2500),
              deterministic,
            }),
          },
        ],
      },
      { timeout: 8000 }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return unchanged(deterministic);
    const parsed = enhancementSchema.parse(JSON.parse(content));
    const score = Math.min(100, Math.max(0, Math.round(deterministic.score + parsed.scoreDelta)));
    return {
      ...deterministic,
      score,
      reasons: parsed.reasons.length > 0 ? parsed.reasons : deterministic.reasons,
      enhanced: true,
      note: "Reasons adjusted with gpt-4o-mini. The base score is still the deterministic fit.",
    };
  } catch {
    return unchanged(deterministic);
  }
}
