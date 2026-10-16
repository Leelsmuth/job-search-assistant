import { and, eq } from "drizzle-orm";
import { applicationEvents, applications } from "@/db/schema";
import { addOrReuseManualApplication } from "@/modules/applications/store";
import { resolveApplicationForJob, type Db } from "@/server/actions/helpers";
import { loadExtensionFillContext } from "@/modules/extension/fill-context";
import type { ExtensionAppliedBody, ExtensionTrackerBody } from "@/modules/extension/payloads";

export async function saveExtensionTracker(db: Db, userId: string, body: ExtensionTrackerBody) {
  return addOrReuseManualApplication(db, userId, {
    company: body.company,
    title: body.title,
    jobUrl: body.jobUrl,
    location: body.location,
    workplaceType: body.workplaceType,
    status: "saved",
    dateApplied: null,
    followUpDate: null,
    notes: null,
    description: body.description,
  });
}

export async function markExtensionApplied(db: Db, userId: string, body: ExtensionAppliedBody) {
  let jobId = body.jobId;
  if (!jobId) {
    const context = await loadExtensionFillContext(db, userId, body.pageUrl);
    jobId = context.job?.id ?? null;
  }
  if (!jobId) {
    if (!body.company || !body.title) {
      throw new Error("Save the job to the tracker before marking it applied");
    }
    const saved = await saveExtensionTracker(db, userId, {
      company: body.company,
      title: body.title,
      jobUrl: body.pageUrl,
      location: body.location,
      workplaceType: null,
      description: body.description,
    });
    jobId = saved.jobId;
  }

  const app = await resolveApplicationForJob(db, userId, jobId);
  const alreadyApplied = app.status === "applied";
  await db
    .update(applications)
    .set({
      status: "applied",
      dateApplied: app.dateApplied ?? new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(applications.id, app.id), eq(applications.userId, userId)));
  await db.insert(applicationEvents).values({
    applicationId: app.id,
    eventType: "marked_applied",
    eventDate: new Date(),
    notes: "Assisted apply snapshot from the browser extension. The application was not submitted by the extension.",
    payload: {
      kind: "assisted_apply",
      provider: body.provider,
      applyUrl: body.pageUrl,
      resumeVersionId: null,
      coverLetterId: null,
      answers: body.filled.map((item) => ({
        question: item.question,
        answer: item.answer,
        source: "extension",
        unsupportedClaims: [],
      })),
    },
  });
  return { applicationId: app.id, jobId, alreadyApplied };
}
