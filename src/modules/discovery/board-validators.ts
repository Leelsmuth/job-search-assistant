import { AsyncLocalStorage } from "node:async_hooks";

export class NotModifiedError extends Error {
  readonly etag: string | null;
  readonly lastModified: string | null;

  constructor(etag: string | null, lastModified: string | null) {
    super("Not modified");
    this.name = "NotModifiedError";
    this.etag = etag;
    this.lastModified = lastModified;
  }
}

export type BoardValidatorSlot = {
  etag?: string | null;
  lastModified?: string | null;
  observedEtag?: string | null;
  observedLastModified?: string | null;
};

const storage = new AsyncLocalStorage<BoardValidatorSlot>();

export function withBoardValidators<T>(slot: BoardValidatorSlot, fn: () => Promise<T>): Promise<T> {
  return storage.run(slot, fn);
}

export function applyConditionalHeaders(headers: HeadersInit | undefined): Headers {
  const merged = new Headers(headers);
  const slot = storage.getStore();
  if (!slot) return merged;
  if (slot.etag) merged.set("If-None-Match", slot.etag);
  if (slot.lastModified) merged.set("If-Modified-Since", slot.lastModified);
  return merged;
}

export function noteResponseValidators(response: Response): void {
  const slot = storage.getStore();
  if (!slot) return;
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  if (etag) slot.observedEtag = etag;
  if (lastModified) slot.observedLastModified = lastModified;
  if (response.status === 304 && (slot.etag || slot.lastModified)) {
    throw new NotModifiedError(slot.observedEtag ?? slot.etag ?? null, slot.observedLastModified ?? slot.lastModified ?? null);
  }
}
