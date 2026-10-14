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
