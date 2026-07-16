import type { Db } from "@/server/actions/helpers";
import { aiRuns } from "@/db/schema";
import { measureOperation } from "./measure-operation";

export async function logAiRun(
  db: Db,
  input: {
    userId: string;
    taskType: string;
    promptVersion: string;
    model: string | null;
    inputHash: string;
    inputSummary: string;
    output?: unknown;
    status: "completed" | "failed";
    tokenInputCount?: number;
    tokenOutputCount?: number;
    durationMs?: number;
  }
): Promise<void> {
  await db.insert(aiRuns).values({
    userId: input.userId,
    taskType: input.taskType,
    promptVersion: input.promptVersion,
    model: input.model,
    inputHash: input.inputHash,
    inputSummary: input.inputSummary,
    output: {
      ...(typeof input.output === "object" && input.output !== null
        ? (input.output as Record<string, unknown>)
        : {}),
      durationMs: input.durationMs,
    },
    status: input.status,
    tokenInputCount: input.tokenInputCount,
    tokenOutputCount: input.tokenOutputCount,
  });
}

export async function measureOpenAiCall<T>(
  operation: string,
  task: () => Promise<T>,
  metadata?: { inputChars?: number; model?: string }
): Promise<T> {
  return measureOperation(operation, task, {
    source: "openai",
    recordCount: metadata?.inputChars,
  });
}
