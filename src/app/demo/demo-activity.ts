"use client";

import { useSyncExternalStore } from "react";
import { DEMO_ACTIVE_KEY } from "@/modules/demo/storage-keys";

/**
 * The "demo in progress" marker. Kept separate from the demo store so the
 * landing page can read it without loading the demo state, sample jobs, and
 * tracker code. The demo store is the only writer.
 */

const listeners = new Set<() => void>();

function readMarker(): boolean {
  try {
    return window.localStorage.getItem(DEMO_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

function onStorage(event: StorageEvent) {
  // key is null when another tab clears storage.
  if (event.key !== null && event.key !== DEMO_ACTIVE_KEY) return;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Called by the demo store whenever it saves. Writes only when the value changes. */
export function setDemoActiveMarker(active: boolean) {
  if (readMarker() === active) return;
  try {
    if (active) window.localStorage.setItem(DEMO_ACTIVE_KEY, "1");
    else window.localStorage.removeItem(DEMO_ACTIVE_KEY);
  } catch {
    // Storage unavailable: the landing page falls back to the copy for new visitors.
    return;
  }
  for (const listener of listeners) listener();
}

/** Whether the visitor has changes in the demo. Null on the server and during hydration. */
export function useDemoInProgress(): boolean | null {
  return useSyncExternalStore(subscribe, readMarker, () => null);
}
