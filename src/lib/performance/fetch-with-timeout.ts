import { applyConditionalHeaders, noteResponseValidators } from "@/modules/discovery/board-validators";

const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _omit, ...fetchInit } = init ?? {};
  const response = await fetch(input, {
    ...fetchInit,
    headers: applyConditionalHeaders(fetchInit.headers),
    signal: AbortSignal.timeout(timeoutMs),
  });
  noteResponseValidators(response);
  return response;
}
