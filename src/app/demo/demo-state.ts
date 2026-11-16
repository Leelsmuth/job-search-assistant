import { isTrackerStage, type TrackerStage } from "@/modules/applications/tracker";

export const demoJobs = [
  {
    id: "frontend",
    title: "Frontend Engineer",
    company: "Northwind Studio",
    location: "Remote · Canada",
    description: "Build accessible React components and help maintain a shared design system.",
  },
  {
    id: "product",
    title: "Product Engineer",
    company: "Maple Ridge Labs",
    location: "Hybrid · Toronto",
    description: "Ship full-stack features for a small scheduling product.",
  },
  {
    id: "platform",
    title: "Platform Developer",
    company: "Harborline Software",
    location: "Remote · Canada",
    description: "Build internal APIs and improve the reliability of developer tools.",
  },
] as const;

export type DemoJob = (typeof demoJobs)[number];
type DemoEntry = { saved: boolean; status: TrackerStage };
export type DemoState = Partial<Record<DemoJob["id"], DemoEntry>>;

const storageKey = "job-search-assistant:demo:v1";
let fallback = "";
let storageUnavailable = false;
const listeners = new Set<() => void>();

export function subscribeToDemo(listener: () => void) {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readDemoSnapshot() {
  if (storageUnavailable) return fallback;
  try {
    return window.localStorage.getItem(storageKey) ?? "";
  } catch {
    return fallback;
  }
}

export function emptyDemoSnapshot() {
  return "";
}

export function parseDemoSnapshot(snapshot: string): DemoState {
  if (!snapshot) return {};
  try {
    const data: unknown = JSON.parse(snapshot);
    if (typeof data !== "object" || data === null) return {};

    const state: DemoState = {};
    for (const { id } of demoJobs) {
      const entry = (data as Record<string, Partial<DemoEntry> | undefined>)[id];
      if (typeof entry?.saved === "boolean" && isTrackerStage(entry.status)) {
        state[id] = { saved: entry.saved, status: entry.status };
      }
    }
    return state;
  } catch {
    return {};
  }
}

export function updateDemo(update: (state: DemoState) => DemoState) {
  const state = update(parseDemoSnapshot(readDemoSnapshot()));
  fallback = Object.keys(state).length ? JSON.stringify(state) : "";
  try {
    if (fallback) window.localStorage.setItem(storageKey, fallback);
    else window.localStorage.removeItem(storageKey);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }
  listeners.forEach((listener) => listener());
}
