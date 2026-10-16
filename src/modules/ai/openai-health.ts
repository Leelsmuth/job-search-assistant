import OpenAI from "openai";
import { readOpenAiApiKey } from "@/lib/env";
import { redactSecret } from "@/lib/redact-secret";

export type OpenAiHealthReport = {
  configured: boolean;
  ok: boolean;
  reason: "ok" | "no_key" | "gate" | "error";
  detail: string;
};

export async function checkOpenAiHealth(): Promise<OpenAiHealthReport> {
  const read = readOpenAiApiKey();
  if (!read.ok) {
    return {
      configured: false,
      ok: false,
      reason: read.reason,
      detail:
        read.reason === "no_key"
          ? "OPENAI_API_KEY is not set in the server runtime."
          : "OPENAI_API_KEY is present but failed the server-side key check.",
    };
  }

  try {
    const client = new OpenAI({ apiKey: read.key, timeout: 8000, maxRetries: 0 });
    await client.models.list();
    return {
      configured: true,
      ok: true,
      reason: "ok",
      detail: "OpenAI accepted the key.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI request failed";
    return {
      configured: true,
      ok: false,
      reason: "error",
      detail: redactSecret(message, read.key),
    };
  }
}
