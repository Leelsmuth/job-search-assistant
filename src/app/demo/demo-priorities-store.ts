"use client";

import { useSyncExternalStore } from "react";
import {
  SUGGESTED_PRIORITY_ORDER,
  movePriority,
  parsePriorityOrder,
  type PriorityId,
} from "@/modules/compare/priorities";
import { DEMO_PRIORITIES_KEY } from "@/modules/demo/storage-keys";

/**
 * The visitor's ranked priorities for comparing roles. Kept in localStorage
 * so the ranking is there next time; it is a preference, not a demo change,
 * so Reset demo and the landing page marker ignore it. The store also tracks
 * whether the save worked, so the panel never claims "Saved" when it was not.
 */
/**
 * What happened to the visitor's order, so the panel can say so:
 * - "default": nothing saved yet; the suggested order is in use.
 * - "saved": the order is in localStorage and will be there next visit.
 * - "unsaved": the browser refused the write (private mode, blocked storage),
 *   so the order lasts until the page is reloaded.
 */
export type PrioritiesSaveStatus = "default" | "saved" | "unsaved";

export type DemoPrioritiesState = {
  order: readonly PriorityId[];
  save: PrioritiesSaveStatus;
  /** When this page last saved a change (ms since epoch), for a brief "Saved just now". */
  savedAt: number | null;
};

let current: DemoPrioritiesState | null = null;
const listeners = new Set<() => void>();

function read(): DemoPrioritiesState {
  try {
    const raw = window.localStorage.getItem(DEMO_PRIORITIES_KEY);
    if (raw) return { order: parsePriorityOrder(JSON.parse(raw)), save: "saved", savedAt: null };
  } catch {
    // Unreadable or blocked: start from the suggestion. A blocked write shows up on the first change.
  }
  return { order: SUGGESTED_PRIORITY_ORDER, save: "default", savedAt: null };
}

/** False when the browser refused the write. */
function write(order: readonly PriorityId[]): boolean {
  try {
    window.localStorage.setItem(DEMO_PRIORITIES_KEY, JSON.stringify(order));
    return true;
  } catch {
    return false;
  }
}

function getState(): DemoPrioritiesState {
  if (!current) current = read();
  return current;
}

function getOrder(): readonly PriorityId[] {
  return getState().order;
}

function setOrder(order: readonly PriorityId[]) {
  if (order === getState().order) return;
  const saved = write(order);
  current = { order, save: saved ? "saved" : "unsaved", savedAt: saved ? Date.now() : null };
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== DEMO_PRIORITIES_KEY) return;
  // Ranked in another tab: re-read on the next snapshot.
  current = null;
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

/** The visitor's order. Null while rendering on the server and during hydration. */
export function useDemoPriorities(): readonly PriorityId[] | null {
  return useSyncExternalStore(subscribe, getOrder, () => null);
}

/** The order plus whether it is saved. Null while rendering on the server and during hydration. */
export function useDemoPrioritiesState(): DemoPrioritiesState | null {
  return useSyncExternalStore(subscribe, getState, () => null);
}

export const demoPriorityActions = {
  move(id: PriorityId, toIndex: number) {
    setOrder(movePriority(getOrder(), id, toIndex));
  },
  useSuggested() {
    setOrder(SUGGESTED_PRIORITY_ORDER);
  },
};
