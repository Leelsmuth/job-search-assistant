const MINI_INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const MINI_OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

export function estimateResumeParseCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  if (!model.includes("gpt-4o-mini")) return null;
  const cost =
    inputTokens * MINI_INPUT_USD_PER_TOKEN + outputTokens * MINI_OUTPUT_USD_PER_TOKEN;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
