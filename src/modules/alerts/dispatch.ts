import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jobAlerts, jobs } from "@/db/schema";
import { withUserDb } from "@/db/user-context";
import type { Db } from "@/server/actions/helpers";
import { planInstantAlerts, type AlertCandidate } from "@/modules/alerts/gating";
import { renderInstantAlertEmail, sendInstantAlertEmail } from "@/modules/alerts/email";
import { digestAppBaseUrl } from "@/modules/digest/select";
import { torontoCalendarDate } from "@/modules/digest/time";
import { lookupAuthEmail } from "@/modules/digest/recipients";
import { loadSearchPreferences } from "@/modules/matching/load-search-preferences";

export type AlertDispatchResult = {
  sent: number;
  queued: number;
  emailed: boolean;
};

type JobSnap = AlertCandidate & { title: string; companyName: string };

export async function dispatchInstantAlerts(input: {
  userId: string;
  newJobIds: readonly string[];
  now?: Date;
}): Promise<AlertDispatchResult> {
  const now = input.now ?? new Date();
  const owner = getDb();
  const planned = await withUserDb(input.userId, (db) => loadPlan(db, input.userId, input.newJobIds, now));

  let emailed = false;
  if (planned.plan.sendJobIds.length > 0) {
    const email = await lookupAuthEmail(owner, input.userId);
    const message = renderInstantAlertEmail(
      planned.plan.sendJobIds.flatMap((jobId) => {
        const job = planned.jobs.get(jobId);
        if (!job) return [];
        return [
          {
            id: job.jobId,
            title: job.title,
            companyName: job.companyName,
            score: Math.round(job.fitScore ?? 0),
            href: `/jobs/${job.jobId}`,
          },
        ];
      }),
      digestAppBaseUrl()
    );
    const sent = await sendInstantAlertEmail({ to: email ?? "", ...message });
    emailed = sent.ok;
  }

  await withUserDb(input.userId, async (db) => {
    if (emailed) {
      for (const jobId of planned.plan.sendJobIds) {
        const job = planned.jobs.get(jobId);
        await db
          .insert(jobAlerts)
          .values({
            userId: input.userId,
            jobId,
            status: "sent",
            fitScore: job?.fitScore,
            postedAt: job?.postedAt,
            sentAt: now,
          })
          .onConflictDoUpdate({
            target: [jobAlerts.userId, jobAlerts.jobId],
            set: { status: "sent", sentAt: now, queuedUntil: null },
          });
      }
    }
    for (const item of planned.plan.queue) {
      const job = planned.jobs.get(item.jobId);
      await db
        .insert(jobAlerts)
        .values({
          userId: input.userId,
          jobId: item.jobId,
          status: "queued",
          fitScore: job?.fitScore,
          postedAt: job?.postedAt,
          queuedUntil: item.queuedUntil,
        })
        .onConflictDoNothing();
    }
    const kept = new Set([...planned.plan.sendJobIds, ...planned.plan.queue.map((item) => item.jobId)]);
    for (const jobId of planned.dueQueuedIds) {
      if (kept.has(jobId)) continue;
      await db
        .delete(jobAlerts)
        .where(and(eq(jobAlerts.userId, input.userId), eq(jobAlerts.jobId, jobId), eq(jobAlerts.status, "queued")));
    }
  });

  return {
    sent: emailed ? planned.plan.sendJobIds.length : 0,
    queued: planned.plan.queue.length,
    emailed,
  };
}

async function loadPlan(db: Db, userId: string, newJobIds: readonly string[], now: Date) {
  const prefs = await loadSearchPreferences(db, userId);
  const queuedRows = await db.query.jobAlerts.findMany({
    where: and(eq(jobAlerts.userId, userId), eq(jobAlerts.status, "queued")),
    columns: { jobId: true, queuedUntil: true, status: true },
  });
  const dueQueuedIds = queuedRows
    .filter((row) => row.queuedUntil && row.queuedUntil.getTime() <= now.getTime())
    .map((row) => row.jobId);
  const waitingIds = new Set(
    queuedRows
      .filter((row) => !row.queuedUntil || row.queuedUntil.getTime() > now.getTime())
      .map((row) => row.jobId)
  );

  const ids = [...new Set([...newJobIds, ...dueQueuedIds])];
  const snaps = new Map<string, JobSnap>();
  for (const jobId of ids) {
    const row = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.userId, userId)),
      columns: {
        id: true,
        title: true,
        fitScore: true,
        fitEligible: true,
        postedAt: true,
        jobUrl: true,
      },
      with: { company: { columns: { name: true } } },
    });
    if (!row) continue;
    snaps.set(row.id, {
      jobId: row.id,
      title: row.title,
      companyName: row.company?.name ?? "Company",
      fitScore: row.fitScore,
      fitEligible: row.fitEligible,
      postedAt: row.postedAt,
    });
  }

  const knownIds = [...snaps.keys()];
  const existing =
    knownIds.length === 0
      ? []
      : await db.query.jobAlerts.findMany({
          where: and(eq(jobAlerts.userId, userId), inArray(jobAlerts.jobId, knownIds)),
          columns: { jobId: true, status: true, sentAt: true },
        });
  const already = new Set<string>();
  for (const row of existing) {
    if (row.status === "sent" || waitingIds.has(row.jobId)) already.add(row.jobId);
  }

  const recentSent = await db.query.jobAlerts.findMany({
    where: and(
      eq(jobAlerts.userId, userId),
      eq(jobAlerts.status, "sent"),
      gte(jobAlerts.sentAt, new Date(now.getTime() - 36 * 60 * 60 * 1000))
    ),
    columns: { sentAt: true },
  });
  const today = torontoCalendarDate(now);
  const sentToday = recentSent.filter((row) => row.sentAt && torontoCalendarDate(row.sentAt) === today).length;

  const plan = planInstantAlerts({
    now,
    enabled: prefs.instantAlertsEnabled,
    minFit: prefs.digestMinFit,
    dailyCap: prefs.instantAlertDailyCap,
    sentToday,
    alreadyAlertedJobIds: already,
    quietStartMinute: prefs.alertQuietStartMinute,
    quietEndMinute: prefs.alertQuietEndMinute,
    candidates: [...snaps.values()],
  });
  return { plan, jobs: snaps, dueQueuedIds };
}
