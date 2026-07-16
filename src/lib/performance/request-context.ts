import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

export type RequestPerfContext = {
  requestId: string;
  source?: string;
  dbQueryCount: number;
};

const storage = new AsyncLocalStorage<RequestPerfContext>();

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function getDbQueryCount(): number {
  return storage.getStore()?.dbQueryCount ?? 0;
}

export function incrementDbQueryCount(): void {
  const store = storage.getStore();
  if (store) store.dbQueryCount += 1;
}

export function runWithPerfContext<T>(
  source: string | undefined,
  fn: () => T
): T {
  return storage.run(
    {
      requestId: randomUUID(),
      source,
      dbQueryCount: 0,
    },
    fn
  );
}

export async function runWithPerfContextAsync<T>(
  source: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(
    {
      requestId: randomUUID(),
      source,
      dbQueryCount: 0,
    },
    fn
  );
}
