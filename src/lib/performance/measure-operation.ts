import { getDbQueryCount, getRequestId } from "./request-context";

export type PerformanceMetadata = {
  operation: string;
  durationMs: number;
  status: "success" | "error";
  source?: string;
  cacheStatus?: "hit" | "miss" | "stale" | "bypass";
  recordCount?: number;
  payloadBytes?: number;
  requestId?: string;
  dbQueryCount?: number;
  error?: string;
};

function shouldLogPerf(): boolean {
  return (
    process.env.PERF_LOG === "1" ||
    process.env.NODE_ENV === "development"
  );
}

export function logPerformance(metadata: PerformanceMetadata): void {
  if (!shouldLogPerf()) return;
  console.info(JSON.stringify({ type: "perf", ...metadata }));
}

export function estimatePayloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

export async function measureOperation<T>(
  operation: string,
  task: () => Promise<T>,
  metadata?: Partial<
    Pick<
      PerformanceMetadata,
      "source" | "cacheStatus" | "recordCount" | "payloadBytes"
    >
  > & { recordCountFromResult?: (result: T) => number }
): Promise<T> {
  const start = performance.now();
  const requestId = getRequestId();

  try {
    const result = await task();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    logPerformance({
      operation,
      durationMs,
      status: "success",
      requestId,
      dbQueryCount: getDbQueryCount(),
      recordCount: metadata?.recordCountFromResult
        ? metadata.recordCountFromResult(result)
        : metadata?.recordCount,
      payloadBytes: metadata?.payloadBytes,
      source: metadata?.source,
      cacheStatus: metadata?.cacheStatus,
    });
    return result;
  } catch (error) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    logPerformance({
      operation,
      durationMs,
      status: "error",
      requestId,
      dbQueryCount: getDbQueryCount(),
      source: metadata?.source,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
