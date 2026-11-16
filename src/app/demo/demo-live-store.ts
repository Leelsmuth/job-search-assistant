"use client";

import { useSyncExternalStore } from "react";
import {
  DEMO_LIVE_JOBS_ENDPOINT,
  parseDemoLiveBatch,
  type DemoLiveBatch,
} from "@/modules/demo/live-jobs";
import { DEMO_LIVE_SESSION_KEY } from "@/modules/demo/storage-keys";

/**
 * Browser store for the demo's live jobs. Kept apart from the demo store on
 * purpose: live jobs are not visitor changes, so they never affect Reset or
 * the landing page's "Continue exploring" marker, and they live in
 * sessionStorage so they last for the current tab only.
 */
export type DemoLiveState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "ready"; batch: DemoLiveBatch }
  | { status: "error"; message: string };

const OFF: DemoLiveState = { status: "off" };
const LOADING: DemoLiveState = { status: "loading" };

const UNAVAILABLE = "Live jobs are unavailable right now. The sample jobs still work.";
const OFFLINE = "Could not reach the server. Check your connection and try again.";

let current: DemoLiveState | null = null;
/** Bumped when the visitor hides live jobs, so a late response is ignored. */
let generation = 0;
const listeners = new Set<() => void>();

function readSession(): DemoLiveBatch | null {
  try {
    const raw = window.sessionStorage.getItem(DEMO_LIVE_SESSION_KEY);
    return raw ? parseDemoLiveBatch(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeSession(batch: DemoLiveBatch | null) {
  try {
    if (batch) window.sessionStorage.setItem(DEMO_LIVE_SESSION_KEY, JSON.stringify(batch));
    else window.sessionStorage.removeItem(DEMO_LIVE_SESSION_KEY);
  } catch {
    // Storage unavailable: live jobs last until the page is reloaded.
  }
}

function getState(): DemoLiveState {
  if (!current) {
    const batch = readSession();
    current = batch ? { status: "ready", batch } : OFF;
  }
  return current;
}

function setState(next: DemoLiveState) {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Null while rendering on the server and during hydration. */
export function useDemoLiveJobs(): DemoLiveState | null {
  return useSyncExternalStore(subscribe, getState, () => null);
}

async function requestBatch(): Promise<DemoLiveBatch> {
  let response: Response;
  try {
    response = await fetch(DEMO_LIVE_JOBS_ENDPOINT, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error(OFFLINE);
  }
  if (!response.ok) throw new Error(UNAVAILABLE);
  const batch = parseDemoLiveBatch(await response.json().catch(() => null));
  if (!batch) throw new Error(UNAVAILABLE);
  return batch;
}

export const demoLiveActions = {
  async load() {
    if (getState().status === "loading") return;
    const request = ++generation;
    setState(LOADING);
    try {
      const batch = await requestBatch();
      if (request !== generation) return;
      writeSession(batch);
      setState({ status: "ready", batch });
    } catch (error) {
      if (request !== generation) return;
      setState({ status: "error", message: error instanceof Error ? error.message : UNAVAILABLE });
    }
  },
  hide() {
    generation++;
    writeSession(null);
    setState(OFF);
  },
};
