"use client";

import { useSyncExternalStore } from "react";
import {
  EMPTY_COMPARE_SLOTS,
  compareNotice,
  filledIds,
  parseCompareSlots,
  placeInCompare,
  removeFromCompare,
  type CompareNotice,
  type CompareOutcome,
  type CompareSlots,
} from "@/modules/demo/demo-compare";
import { DEMO_COMPARE_SESSION_KEY } from "@/modules/demo/storage-keys";

/**
 * Browser store for the feed's compare tray. Kept apart from the demo store:
 * picking roles to compare is not a change to the demo, so it never affects
 * Reset or the landing page marker. The selection lives in sessionStorage, so
 * it survives opening a job and coming back, and lasts for this tab only.
 * Slots are stored as they are, gaps included, so every job keeps the place
 * the visitor dropped it in.
 */
export type DemoCompareState = {
  slots: CompareSlots;
  /** The job being dragged from the feed, so the tray can show where to drop it. */
  draggingId: string | null;
  /** Latest message for the tray. `key` changes each time, so repeats are announced. */
  notice: (CompareNotice & { key: number }) | null;
};

let current: DemoCompareState | null = null;
let noticeKey = 0;
const listeners = new Set<() => void>();

function readSession(): CompareSlots {
  try {
    const raw = window.sessionStorage.getItem(DEMO_COMPARE_SESSION_KEY);
    return raw ? parseCompareSlots(JSON.parse(raw)) : EMPTY_COMPARE_SLOTS;
  } catch {
    return EMPTY_COMPARE_SLOTS;
  }
}

function writeSession(slots: CompareSlots) {
  try {
    if (filledIds(slots).length > 0) {
      window.sessionStorage.setItem(DEMO_COMPARE_SESSION_KEY, JSON.stringify(slots));
    } else {
      window.sessionStorage.removeItem(DEMO_COMPARE_SESSION_KEY);
    }
  } catch {
    // Storage unavailable: the tray lasts until the page is reloaded.
  }
}

function getState(): DemoCompareState {
  if (!current) current = { slots: readSession(), draggingId: null, notice: null };
  return current;
}

function setState(patch: Partial<DemoCompareState>) {
  const previous = getState();
  const next = { ...previous, ...patch };
  current = next;
  if (next.slots !== previous.slots) writeSession(next.slots);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Null while rendering on the server and during hydration. */
export function useDemoCompare(): DemoCompareState | null {
  return useSyncExternalStore(subscribe, getState, () => null);
}

function keyed(notice: CompareNotice) {
  return { ...notice, key: ++noticeKey };
}

export const demoCompareActions = {
  /**
   * Put a job in the tray. `slot` is where it was dropped; without one (the
   * row's Compare button, or a drop outside the slots) it takes the first
   * empty slot. A job already in the tray moves to `slot`.
   */
  add(jobId: string, slot?: number): CompareOutcome {
    const placement = placeInCompare(getState().slots, jobId, slot);
    setState({ slots: placement.slots, notice: keyed(compareNotice(placement, jobId)) });
    return placement.outcome;
  },
  remove(jobId: string) {
    const before = getState().slots;
    const slots = removeFromCompare(before, jobId);
    if (slots === before) return;
    setState({ slots, notice: keyed(compareNotice({ outcome: "removed", slots }, jobId)) });
  },
  toggle(jobId: string) {
    if (getState().slots.includes(jobId)) demoCompareActions.remove(jobId);
    else demoCompareActions.add(jobId);
  },
  clear() {
    if (filledIds(getState().slots).length === 0) return;
    setState({
      slots: EMPTY_COMPARE_SLOTS,
      notice: keyed({ tone: "info", text: "Compare cleared." }),
    });
  },
  startDrag(jobId: string) {
    setState({ draggingId: jobId });
  },
  endDrag() {
    if (getState().draggingId !== null) setState({ draggingId: null });
  },
};
