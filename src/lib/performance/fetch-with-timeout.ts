const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _omit, ...fetchInit } = init ?? {};
  return fetch(input, {
    ...fetchInit,
    signal: AbortSignal.timeout(timeoutMs),
  });
}
