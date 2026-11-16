"use client";

import { useSyncExternalStore } from "react";
import {
  createDemoState,
  dismissDemoJob,
  isDemoStatePristine,
  parseDemoState,
  refreshStalePristineDemo,
  restoreDemoJob,
  saveDemoJob,
  setDemoApplicationAppliedDate,
  setDemoApplicationFollowUp,
  setDemoApplicationNotes,
  setDemoApplicationStatus,
  unsaveDemoJob,
  type DemoState,
} from "@/modules/demo/demo-state";
import { importIntoDemo, type DemoImportResult } from "@/modules/demo/demo-import";
import { DEMO_STORAGE_KEY } from "@/modules/demo/storage-keys";
import type { DuplicateResolution, ImportRowResult } from "@/modules/applications/tracker-csv";
import { setDemoActiveMarker } from "./demo-activity";

/**
 * Browser-only store for the demo. Each visitor gets their own copy in
 * localStorage; nothing is sent to the server. If storage is unavailable
 * (private mode, blocked cookies) the demo still works for the current page
 * session from memory.
 */
let current: DemoState | null = null;
const listeners = new Set<() => void>();

function readStorage(): DemoState | null {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    return raw ? parseDemoState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** False when the browser refused the write; the demo then lives in memory only. */
let lastWritePersisted = true;

function writeStorage(state: DemoState) {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    lastWritePersisted = true;
  } catch {
    // Quota or privacy settings: keep the in-memory copy.
    lastWritePersisted = false;
  }
  setDemoActiveMarker(!isDemoStatePristine(state));
}

function emit() {
  for (const listener of listeners) listener();
}

function getState(): DemoState {
  if (!current) {
    // Runs once per page load (and when another tab changes the demo), not per render.
    const stored = readStorage();
    current = stored ? refreshStalePristineDemo(stored) : createDemoState();
    if (current !== stored) writeStorage(current);
    // Repair the landing page marker if it is missing or was edited by hand.
    else setDemoActiveMarker(!isDemoStatePristine(current));
  }
  return current;
}

function setState(next: DemoState) {
  if (next === current) return;
  current = next;
  writeStorage(next);
  emit();
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== DEMO_STORAGE_KEY) return;
  // Another tab changed or reset the demo. Re-read on next snapshot.
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Null while rendering on the server and during hydration. */
export function useDemoState(): DemoState | null {
  return useSyncExternalStore(subscribe, getState, () => null);
}

function update(transition: (state: DemoState) => DemoState) {
  setState(transition(getState()));
}

export const demoActions = {
  saveJob(jobId: string) {
    update((state) => saveDemoJob(state, jobId));
  },
  unsaveJob(jobId: string) {
    update((state) => unsaveDemoJob(state, jobId));
  },
  dismissJob(jobId: string) {
    update((state) => dismissDemoJob(state, jobId));
  },
  restoreJob(jobId: string) {
    update((state) => restoreDemoJob(state, jobId));
  },
  setStatus(applicationId: string, status: string) {
    update((state) => setDemoApplicationStatus(state, applicationId, status));
  },
  setNotes(applicationId: string, notes: string) {
    const before = getState();
    update((state) => setDemoApplicationNotes(state, applicationId, notes));
    return { changed: getState() !== before };
  },
  setFollowUp(applicationId: string, followUpDate: string) {
    update((state) => setDemoApplicationFollowUp(state, applicationId, followUpDate));
  },
  setAppliedDate(applicationId: string, dateApplied: string) {
    update((state) => setDemoApplicationAppliedDate(state, applicationId, dateApplied));
  },
  /**
   * Start over with fresh sample data. Returns the previous state for undo, or
   * null when nothing has changed since the demo was seeded.
   */
  reset(): DemoState | null {
    const previous = getState();
    if (isDemoStatePristine(previous)) return null;
    setState(createDemoState());
    return previous;
  },
  restore(state: DemoState) {
    setState(state);
  },
  /**
   * Import spreadsheet rows. Duplicates are matched against the state at this
   * moment, with the visitor's choices applied. Returns the previous state for
   * undo, and whether the result reached localStorage: a large import can hit
   * the browser's storage quota, and the visitor should know it will not last.
   */
  importRows(
    rows: readonly ImportRowResult[],
    resolutions: Readonly<Record<number, DuplicateResolution>>
  ): { previous: DemoState; summary: DemoImportResult["summary"]; persisted: boolean } {
    const previous = getState();
    const result = importIntoDemo(previous, rows, resolutions);
    setState(result.state);
    return { previous, summary: result.summary, persisted: lastWritePersisted };
  },
};
