"use server";

import { revalidatePath } from "next/cache";
import { withUserDb } from "@/db/user-context";
import { getUser } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/utils";
import {
  addManualApplication as addManualApplicationDb,
  appliedDateFromUnknown,
  followUpFromUnknown,
  getTrackedApplication as getTrackedApplicationDb,
  listTrackedApplications as listTrackedApplicationsDb,
  setApplicationAppliedDate,
  setApplicationFollowUp,
  setApplicationNotes,
  setApplicationStatus,
} from "@/modules/applications/store";
import { parseManualApplication } from "@/modules/applications/tracker";
import {
  describeImportFailure,
  importApplicationsDb,
  listImportCandidates,
} from "@/modules/applications/import-store";
import {
  ImportRequestError,
  parseImportRequest,
  type ImportActionResult,
  type ImportCandidatesResult,
} from "@/modules/applications/tracker-import";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

function revalidateTracked(applicationId: string, jobId?: string) {
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/dashboard");
  if (jobId) {
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${jobId}`);
  }
}

function withTrackerError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Could not update the application";
  if (/invalid input value for enum application_status/i.test(message)) {
    throw new Error(
      "Interviewing is not available until migration 0015_application_tracker_status.sql is applied"
    );
  }
  throw error instanceof Error ? error : new Error(message);
}

export async function listTrackedApplications() {
  const user = await requireUser();
  return withUserDb(user.id, (db) => listTrackedApplicationsDb(db, user.id));
}

export async function getTrackedApplication(applicationId: string) {
  const user = await requireUser();
  return withUserDb(user.id, (db) => getTrackedApplicationDb(db, user.id, applicationId));
}

export async function updateTrackedStatus(applicationId: string, status: ApplicationStatus) {
  const user = await requireUser();
  try {
    const result = await withUserDb(user.id, (db) =>
      setApplicationStatus(db, user.id, applicationId, status)
    );
    revalidateTracked(applicationId, result.jobId);
    return result;
  } catch (error) {
    withTrackerError(error);
  }
}

export async function updateTrackedNotes(applicationId: string, notes: string) {
  const user = await requireUser();
  const result = await withUserDb(user.id, (db) =>
    setApplicationNotes(db, user.id, applicationId, notes)
  );
  revalidateTracked(applicationId, result.jobId);
  return result;
}

export async function updateTrackedFollowUp(applicationId: string, followUpDate: string) {
  const user = await requireUser();
  const parsed = followUpFromUnknown(followUpDate);
  const result = await withUserDb(user.id, (db) =>
    setApplicationFollowUp(db, user.id, applicationId, parsed)
  );
  revalidateTracked(applicationId, result.jobId);
  return result;
}

export async function updateTrackedAppliedDate(applicationId: string, dateApplied: string) {
  const user = await requireUser();
  const parsed = appliedDateFromUnknown(dateApplied);
  const result = await withUserDb(user.id, (db) =>
    setApplicationAppliedDate(db, user.id, applicationId, parsed)
  );
  revalidateTracked(applicationId, result.jobId);
  return result;
}

export async function addManualApplication(input: unknown) {
  const user = await requireUser();
  const parsed = parseManualApplication(input);
  try {
    const result = await withUserDb(user.id, (db) => addManualApplicationDb(db, user.id, parsed));
    revalidateTracked(result.applicationId, result.jobId);
    return result;
  } catch (error) {
    withTrackerError(error);
  }
}

// ---------------------------------------------------------------------------
// Spreadsheet import
//
// These return failures as values instead of throwing: Next.js hides thrown
// messages in production, and the person importing needs to know what
// happened to their data.
// ---------------------------------------------------------------------------

const SIGNED_OUT = "Your session has ended. Sign in again, then import the file. Nothing was imported.";

/** The user's tracked applications, for matching duplicates in the import preview. */
export async function getImportCandidates(): Promise<ImportCandidatesResult> {
  const user = await getUser();
  if (!user) return { status: "error", message: SIGNED_OUT };
  try {
    const rows = await withUserDb(user.id, (db) => listImportCandidates(db, user.id));
    // The job id stays on the server.
    const candidates = rows.map(({ jobId: _jobId, ...candidate }) => candidate);
    return { status: "ok", candidates };
  } catch (error) {
    console.error("[import] could not load tracked applications", error);
    return {
      status: "error",
      message: "Your tracked applications could not be loaded, so duplicates cannot be checked. Try again in a moment.",
    };
  }
}

/**
 * Save an import. The request is validated again here, duplicates are matched
 * against the database, and everything happens in one transaction: either
 * every row is saved or none is.
 */
export async function importTrackedApplications(input: unknown): Promise<ImportActionResult> {
  const user = await getUser();
  if (!user) return { status: "error", message: SIGNED_OUT };

  let request;
  try {
    request = parseImportRequest(input);
  } catch (error) {
    if (error instanceof ImportRequestError) {
      return { status: "error", message: `${error.message}. Nothing was imported.` };
    }
    throw error;
  }

  try {
    const result = await withUserDb(user.id, (db) => importApplicationsDb(db, user.id, request));
    if (result.status === "imported") {
      revalidatePath("/applications");
      revalidatePath("/dashboard");
      // A row can attach to a job already in the feed, which then shows as saved.
      revalidatePath("/jobs");
    }
    return result;
  } catch (error) {
    console.error("[import] failed; the transaction was rolled back", {
      rows: request.rows.length,
      error,
    });
    return { status: "error", message: describeImportFailure(error) };
  }
}
