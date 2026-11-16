"use client";

import { createContext, useContext } from "react";
import type { ApplicationStatus } from "@/lib/utils";

/**
 * Lets the application tracker UI run against a store other than the server.
 *
 * The signed-in app renders the tracker with no provider, so the components call
 * the server actions, refresh the route, and link to /applications and /jobs.
 * The public demo provides an adapter backed by browser storage instead.
 */
export type TrackerAdapter = {
  updateStatus: (applicationId: string, status: ApplicationStatus) => Promise<unknown>;
  updateNotes: (applicationId: string, notes: string) => Promise<unknown>;
  updateFollowUp: (applicationId: string, followUpDate: string) => Promise<unknown>;
  updateAppliedDate: (applicationId: string, dateApplied: string) => Promise<unknown>;
  /** Null when the application has no page of its own; the UI then shows plain text. */
  applicationHref: (application: { id: string; jobId: string }) => string | null;
  /** Null when there is no job page to link to. */
  jobHref: (application: { id: string; jobId: string }) => string | null;
};

const TrackerAdapterContext = createContext<TrackerAdapter | null>(null);

export function TrackerAdapterProvider({
  adapter,
  children,
}: {
  adapter: TrackerAdapter;
  children: React.ReactNode;
}) {
  return <TrackerAdapterContext.Provider value={adapter}>{children}</TrackerAdapterContext.Provider>;
}

/** Null means "use the server": the default for the signed-in app. */
export function useTrackerAdapter(): TrackerAdapter | null {
  return useContext(TrackerAdapterContext);
}

export function applicationHrefFor(
  adapter: TrackerAdapter | null,
  application: { id: string; jobId: string }
): string | null {
  return adapter ? adapter.applicationHref(application) : `/applications/${application.id}`;
}

export function jobHrefFor(
  adapter: TrackerAdapter | null,
  application: { id: string; jobId: string }
): string | null {
  return adapter ? adapter.jobHref(application) : `/jobs/${application.jobId}`;
}
