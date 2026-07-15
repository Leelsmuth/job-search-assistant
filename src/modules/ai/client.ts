import OpenAI from "openai";
import { z } from "zod";
import { hashInput } from "@/lib/utils";
import { validateTailoringSuggestions, validateDraftAnswerResponse, type TailoringSuggestionInput, type DraftAnswerResult } from "@/modules/ai/schemas";
import { extractTechnologies } from "@/modules/ingestion/extract-requirements";

function isOpenAiConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return false;
  if (/your-key|placeholder|changeme|xxx/i.test(key)) return false;
  return key.startsWith("sk-");
}

const openai = isOpenAiConfigured()
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export const profileExtractionSchema = z.object({
  displayName: z.string().optional(),
  location: z.string().optional(),
  workAuthorization: z.string().optional(),
  targetTitles: z.array(z.string()).default([]),
  preferredSeniority: z.string().optional(),
  remotePreference: z.string().optional(),
  yearsExperience: z.number().optional(),
  summary: z.string().optional(),
  skills: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      proficiency: z.string().optional(),
      yearsExperience: z.number().optional(),
    })
  ).default([]),
  experiences: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      location: z.string().optional(),
      bullets: z.array(z.string()).default([]),
    })
  ).default([]),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      skills: z.array(z.string()).default([]),
    })
  ).default([]),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string().optional(),
      field: z.string().optional(),
      endDate: z.string().optional(),
    })
  ).default([]),
});

export type ProfileExtraction = z.infer<typeof profileExtractionSchema>;

export async function extractProfileFromResume(
  resumeText: string
): Promise<ProfileExtraction | null> {
  if (!openai) {
    return extractProfileHeuristic(resumeText);
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Extract structured profile data from resume text. Return JSON only.
Do not invent experience not present in the resume.
Prompt version: resume.extract_profile.v1`,
        },
        { role: "user", content: resumeText.slice(0, 12000) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return extractProfileHeuristic(resumeText);
    return profileExtractionSchema.parse(JSON.parse(content));
  } catch {
    return extractProfileHeuristic(resumeText);
  }
}

function extractProfileHeuristic(resumeText: string): ProfileExtraction {
  const skills: ProfileExtraction["skills"] = [];
  const skillPatterns = [
    "React", "TypeScript", "JavaScript", "Next.js", "Node.js", "GraphQL",
    "Playwright", "Vitest", "Tailwind CSS", "Redux", "Zustand", "Firebase",
  ];
  for (const name of skillPatterns) {
    if (resumeText.toLowerCase().includes(name.toLowerCase())) {
      skills.push({ name, category: "framework" });
    }
  }

  const yearsMatch = resumeText.match(/(\d+)\+?\s*years?/i);
  const experiences: ProfileExtraction["experiences"] = [];
  const expBlocks = resumeText.split(/\n(?=[A-Z][^\n]+\|)/);
  for (const block of expBlocks.slice(0, 3)) {
    const lines = block.split("\n").filter(Boolean);
    if (lines.length >= 2) {
      experiences.push({
        company: lines[0].split("|")[0]?.trim() || "Unknown",
        title: lines[0].split("|")[1]?.trim() || "Engineer",
        bullets: lines.slice(1).map((l) => l.replace(/^[-•]\s*/, "")).filter((l) => l.length > 10),
      });
    }
  }

  return {
    skills,
    experiences,
    projects: [],
    education: [],
    targetTitles: [],
    yearsExperience: yearsMatch ? parseInt(yearsMatch[1], 10) : undefined,
    summary: resumeText.split("\n").find((l) => l.length > 30 && l.length < 200),
    remotePreference: /remote/i.test(resumeText) ? "remote" : undefined,
    location: /canada/i.test(resumeText) ? "Canada" : undefined,
  };
}

export async function generateTailoringSuggestions(
  jobDescription: string,
  evidence: Array<{ id: string; evidenceText: string }>,
  bullets: Array<{ id: string; text: string }>
): Promise<TailoringSuggestionInput[]> {
  const bulletIds = new Set(bullets.map((b) => b.id));
  const evidenceIds = new Set(evidence.map((e) => e.id));
  const bulletsById = new Map(bullets.map((b) => [b.id, b.text]));

  const heuristicFallback = (): TailoringSuggestionInput[] =>
    bullets.slice(0, 3).map((b) => ({
      suggestionType: "emphasize" as const,
      bulletId: b.id,
      originalText: b.text,
      suggestedText: b.text,
      confidence: 0.5,
    }));

  if (!openai) {
    return heuristicFallback();
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Suggest resume bullet improvements for a job. Never invent experience.
Only rewrite existing bullets to emphasize relevant skills.
Each suggestion MUST include bulletId from the provided bullets list.
Optional evidenceId MUST come from the provided evidence list.
Return JSON: { "suggestions": [...] }
Prompt version: resume.tailor_suggestions.v1`,
        },
        {
          role: "user",
          content: JSON.stringify({
            jobDescription: jobDescription.slice(0, 4000),
            bullets: bullets.map((b) => ({ id: b.id, text: b.text })),
            evidence: evidence.map((e) => ({ id: e.id, text: e.evidenceText })),
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return heuristicFallback();
    const parsed = JSON.parse(content);
    const validated = validateTailoringSuggestions(
      parsed.suggestions ?? parsed,
      bulletIds,
      evidenceIds,
      bulletsById
    );
    return validated.length > 0 ? validated : heuristicFallback();
  } catch {
    return heuristicFallback();
  }
}

function finalizeDraftAnswer(
  answer: string,
  evidenceIds: string[],
  evidence: Array<{ id: string; evidenceText: string }>,
  jobDescription: string,
  extraUnsupported: string[] = []
): DraftAnswerResult {
  const validIds = new Set(evidence.map((e) => e.id));
  const evidenceById = new Map(evidence.map((e) => [e.id, e.evidenceText]));
  const validated = validateDraftAnswerResponse(
    { answer, evidenceIds, unsupportedClaims: extraUnsupported },
    validIds,
    evidenceById,
    jobDescription
  );
  if (!validated.answer.trim()) {
    return {
      answer: "[Draft — review and edit before submitting]",
      evidenceIds: [],
      unsupportedClaims: ["Could not generate a grounded draft"],
    };
  }
  return validated;
}

function draftApplicationAnswerHeuristic(
  question: string,
  profileSummary: string,
  jobDescription: string,
  evidence: Array<{ id: string; evidenceText: string }>
): DraftAnswerResult {
  const evidenceTexts = evidence.map((e) => e.evidenceText);
  const techs = extractTechnologies(jobDescription).slice(0, 5);
  const techPhrase = techs.length ? techs.join(", ") : "the technologies mentioned";
  const evidenceSnippet =
    evidenceTexts.find((e) => e.length > 40) ?? evidenceTexts[0] ?? "";
  const snippetEntry = evidence.find((e) => e.evidenceText === evidenceSnippet);
  const usedIds = new Set<string>();
  if (snippetEntry) usedIds.add(snippetEntry.id);

  const summaryLine = profileSummary?.trim() || evidenceSnippet;
  const q = question.toLowerCase();

  if (q.includes("interested in this role") || q.includes("why this role")) {
    return finalizeDraftAnswer(
      [
        `I'm interested in this role because it aligns with my frontend experience and the problems you're solving.`,
        summaryLine ? ` ${summaryLine}` : "",
        techs.length
          ? ` The role's focus on ${techPhrase} matches work I've done recently, and I'd like to apply that in a product-focused team.`
          : " I'd welcome the chance to contribute to the team and grow with the product.",
        " [Draft — review and edit before submitting]",
      ].join(""),
      Array.from(usedIds),
      evidence,
      jobDescription,
      !snippetEntry && summaryLine ? ["Summary used without linked evidence"] : []
    );
  }

  if (q.includes("work at this company") || q.includes("why do you want")) {
    return finalizeDraftAnswer(
      [
        `I'm drawn to this company because of the product scope and engineering culture described in the posting.`,
        evidenceSnippet
          ? ` My background includes: ${evidenceSnippet.slice(0, 200)}${evidenceSnippet.length > 200 ? "…" : ""}`
          : "",
        " I'd value the chance to contribute while continuing to deepen my frontend craft.",
        " [Draft — review and edit before submitting]",
      ].join(""),
      snippetEntry ? [snippetEntry.id] : [],
      evidence,
      jobDescription,
      !snippetEntry ? ["No profile evidence linked to this draft"] : []
    );
  }

  if (q.includes("react")) {
    const reactEvidence = evidence.filter((e) => /react/i.test(e.evidenceText)).slice(0, 2);
    const examples = reactEvidence.length ? reactEvidence : evidence.slice(0, 2);
    return finalizeDraftAnswer(
      [
        `I have hands-on React experience across product work, including:`,
        ...examples.map(
          (e) => `• ${e.evidenceText.slice(0, 180)}${e.evidenceText.length > 180 ? "…" : ""}`
        ),
        techs.length ? `\nThis role's use of ${techPhrase} is a strong fit for that background.` : "",
        " [Draft — review and edit before submitting]",
      ].join("\n"),
      examples.map((e) => e.id),
      evidence,
      jobDescription
    );
  }

  if (q.includes("challenge") || q.includes("complex")) {
    const challenge = evidence.reduce(
      (best, e) => (e.evidenceText.length > best.evidenceText.length ? e : best),
      evidence[0] ?? { id: "", evidenceText: "" }
    );
    return finalizeDraftAnswer(
      [
        `One example that reflects how I approach complex work:`,
        challenge.evidenceText
          ? `• ${challenge.evidenceText}`
          : "• [Add a specific project from your resume here]",
        "\nI focus on clarity, incremental delivery, and measurable outcomes.",
        " [Draft — review and edit before submitting]",
      ].join("\n"),
      challenge.id ? [challenge.id] : [],
      evidence,
      jobDescription,
      !challenge.id ? ["Add a specific example from your resume"] : []
    );
  }

  if (q.includes("looking for") || q.includes("new role")) {
    return finalizeDraftAnswer(
      [
        `I'm looking for a role where I can take ownership of meaningful frontend work, collaborate closely with product and design, and continue growing technically.`,
        summaryLine ? ` ${summaryLine}` : "",
        " [Draft — review and edit before submitting]",
      ].join(""),
      snippetEntry ? [snippetEntry.id] : [],
      evidence,
      jobDescription
    );
  }

  return finalizeDraftAnswer(
    [
      `Regarding "${question}":`,
      summaryLine || evidenceSnippet
        ? ` ${(summaryLine || evidenceSnippet).slice(0, 300)}`
        : " [Add specifics from your experience]",
      techs.length ? ` This connects to the role's emphasis on ${techPhrase}.` : "",
      " [Draft — review and edit before submitting]",
    ].join(""),
    snippetEntry ? [snippetEntry.id] : [],
    evidence,
    jobDescription,
    !snippetEntry ? ["Limited evidence available for this question"] : []
  );
}

export async function draftApplicationAnswer(
  question: string,
  profileSummary: string,
  jobDescription: string,
  evidence: Array<{ id: string; evidenceText: string }>
): Promise<DraftAnswerResult> {
  const validIds = new Set(evidence.map((e) => e.id));
  const evidenceById = new Map(evidence.map((e) => [e.id, e.evidenceText]));

  if (!openai) {
    return draftApplicationAnswerHeuristic(
      question,
      profileSummary,
      jobDescription,
      evidence
    );
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Draft a job application answer using ONLY provided evidence. Never invent experience.
Return JSON: { "answer": string, "evidenceIds": string[], "unsupportedClaims": string[] }
evidenceIds MUST come from the provided evidence list only.
List any claims in the answer that are not directly supported in unsupportedClaims.
Prompt version: application.draft_answer.v2`,
        },
        {
          role: "user",
          content: JSON.stringify({
            question,
            profileSummary: profileSummary.slice(0, 2000),
            jobDescription: jobDescription.slice(0, 3000),
            evidence: evidence.slice(0, 10).map((e) => ({ id: e.id, text: e.evidenceText })),
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return draftApplicationAnswerHeuristic(
        question,
        profileSummary,
        jobDescription,
        evidence
      );
    }

    const parsed = JSON.parse(content) as unknown;
    const validated = validateDraftAnswerResponse(
      parsed,
      validIds,
      evidenceById,
      jobDescription
    );
    if (validated.answer.trim()) return validated;

    return draftApplicationAnswerHeuristic(
      question,
      profileSummary,
      jobDescription,
      evidence
    );
  } catch {
    return draftApplicationAnswerHeuristic(
      question,
      profileSummary,
      jobDescription,
      evidence
    );
  }
}

export function computeInputHash(taskType: string, input: string): string {
  return hashInput(`${taskType}:${input}`);
}
