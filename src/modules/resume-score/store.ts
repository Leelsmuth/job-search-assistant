import { and, desc, eq, sql } from "drizzle-orm";
import { resumeJobScores } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import type {
  AtsCheck,
  ResumeScoreResult,
  ResumeScoreSource,
  ResumeSuggestion,
} from "@/modules/resume-score/types";

export type StoredResumeScore = {
  id: string;
  source: string;
  resumeHash: string;
  jobHash: string;
  overallScore: number;
  beforeScore: number | null;
  afterScore: number | null;
  suggestions: ResumeSuggestion[] | null;
  resumeVersionId: string | null;
};

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }
  return [];
}

export async function resumeScoreTableReady(db: Db): Promise<boolean> {
  await db.execute(sql`SAVEPOINT resume_score_probe`);
  try {
    const result = await db.execute(sql`select to_regclass('public.resume_job_scores') as rel`);
    await db.execute(sql`RELEASE SAVEPOINT resume_score_probe`);
    const rel = rowsOf(result)[0]?.rel;
    return rel != null;
  } catch {
    await db.execute(sql`ROLLBACK TO SAVEPOINT resume_score_probe`);
    await db.execute(sql`RELEASE SAVEPOINT resume_score_probe`);
    return false;
  }
}

function asSuggestions(value: unknown): ResumeSuggestion[] | null {
  if (!Array.isArray(value)) return null;
  const suggestions: ResumeSuggestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as ResumeSuggestion;
    if (typeof row.bulletId !== "string" || typeof row.suggestedText !== "string") continue;
    if (!Array.isArray(row.keywords) || !Array.isArray(row.evidence)) continue;
    suggestions.push(row);
  }
  return suggestions;
}

export async function readResumeScores(
  db: Db,
  userId: string,
  jobId: string
): Promise<StoredResumeScore[] | null> {
  const ready = await resumeScoreTableReady(db);
  if (!ready) return null;
  const rows = await db.query.resumeJobScores.findMany({
    where: and(eq(resumeJobScores.userId, userId), eq(resumeJobScores.jobId, jobId)),
    orderBy: [desc(resumeJobScores.updatedAt)],
    limit: 8,
  });
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    resumeHash: row.resumeHash,
    jobHash: row.jobHash,
    overallScore: row.overallScore,
    beforeScore: row.beforeScore,
    afterScore: row.afterScore,
    suggestions: asSuggestions(row.suggestions),
    resumeVersionId: row.resumeVersionId,
  }));
}

export async function saveResumeScore(
  db: Db,
  input: {
    userId: string;
    jobId: string;
    resumeVersionId?: string | null;
    resumeDocumentId?: string | null;
    source: ResumeScoreSource;
    resumeHash: string;
    jobHash: string;
    score: ResumeScoreResult;
    suggestions?: ResumeSuggestion[] | null;
    beforeScore?: number | null;
    afterScore?: number | null;
    replaceSuggestions: boolean;
  }
): Promise<boolean> {
  const ready = await resumeScoreTableReady(db);
  if (!ready) return false;
  const existing = await db.query.resumeJobScores.findFirst({
    where: and(
      eq(resumeJobScores.userId, input.userId),
      eq(resumeJobScores.jobId, input.jobId),
      eq(resumeJobScores.resumeHash, input.resumeHash)
    ),
  });
  const suggestions =
    input.replaceSuggestions
      ? input.suggestions ?? null
      : existing && existing.jobHash !== input.jobHash
        ? null
        : undefined;
  const checks: AtsCheck[] = input.score.checks;
  const values = {
    userId: input.userId,
    jobId: input.jobId,
    resumeVersionId: input.resumeVersionId ?? null,
    resumeDocumentId: input.resumeDocumentId ?? null,
    source: input.source,
    resumeHash: input.resumeHash,
    jobHash: input.jobHash,
    overallScore: input.score.overall,
    breakdown: input.score,
    keywords: input.score.extracted,
    atsChecks: checks,
    beforeScore: input.beforeScore ?? existing?.beforeScore ?? null,
    afterScore: input.afterScore ?? existing?.afterScore ?? null,
    updatedAt: new Date(),
    ...(suggestions !== undefined ? { suggestions } : {}),
  };
  await db
    .insert(resumeJobScores)
    .values({
      ...values,
      suggestions: suggestions === undefined ? existing?.suggestions ?? null : suggestions,
    })
    .onConflictDoUpdate({
      target: [resumeJobScores.userId, resumeJobScores.jobId, resumeJobScores.resumeHash],
      set: values,
    });
  return true;
}
