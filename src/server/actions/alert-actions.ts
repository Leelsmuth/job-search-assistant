"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { jobAlerts, searchPreferences } from "@/db/schema";
import { withUserDb } from "@/db/user-context";
import { getUser } from "@/lib/supabase/server";
import { isMissingDatabaseRelation, isMissingSearchPreferenceColumn } from "@/modules/matching/load-search-preferences";
import { defaultSearchPreferences } from "@/modules/matching/search-preferences";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export type AlertListItem = {
  id: string;
  jobId: string;
  title: string;
  companyName: string;
  status: "queued" | "sent";
  fitScore: number | null;
  postedAt: string | null;
  sentAt: string | null;
  queuedUntil: string | null;
  createdAt: string;
};

export async function getAlertSettings(): Promise<{
  schemaReady: boolean;
  enabled: boolean;
  dailyCap: number;
}> {
  const user = await requireUser();
  const defaults = defaultSearchPreferences();
  try {
    return await withUserDb(user.id, async (db) => {
      const row = await db.query.searchPreferences.findFirst({
        where: eq(searchPreferences.userId, user.id),
        columns: { instantAlertsEnabled: true, instantAlertDailyCap: true },
      });
      return {
        schemaReady: true,
        enabled: row?.instantAlertsEnabled ?? defaults.instantAlertsEnabled,
        dailyCap: row?.instantAlertDailyCap ?? defaults.instantAlertDailyCap,
      };
    });
  } catch (error) {
    if (
      isMissingSearchPreferenceColumn(error, "instant_alerts_enabled") ||
      isMissingDatabaseRelation(error, "search_preferences")
    ) {
      return { schemaReady: false, enabled: defaults.instantAlertsEnabled, dailyCap: defaults.instantAlertDailyCap };
    }
    throw error;
  }
}

export async function setInstantAlertsEnabled(enabled: boolean, dailyCap?: number) {
  if (typeof enabled !== "boolean") throw new Error("Invalid alert setting");
  const cap =
    dailyCap == null || Number.isNaN(dailyCap)
      ? defaultSearchPreferences().instantAlertDailyCap
      : Math.min(100, Math.max(0, Math.round(dailyCap)));
  const user = await requireUser();
  await withUserDb(user.id, async (db) => {
    const existing = await db.query.searchPreferences.findFirst({
      where: eq(searchPreferences.userId, user.id),
      columns: { userId: true },
    });
    if (existing) {
      await db
        .update(searchPreferences)
        .set({ instantAlertsEnabled: enabled, instantAlertDailyCap: cap, updatedAt: new Date() })
        .where(eq(searchPreferences.userId, user.id));
      return;
    }
    const defaults = defaultSearchPreferences();
    await db.insert(searchPreferences).values({
      userId: user.id,
      ...defaults,
      instantAlertsEnabled: enabled,
      instantAlertDailyCap: cap,
      updatedAt: new Date(),
    });
  });
  revalidatePath("/settings");
  revalidatePath("/alerts");
}

export async function listJobAlerts(): Promise<{ schemaReady: boolean; alerts: AlertListItem[] }> {
  const user = await requireUser();
  try {
    return await withUserDb(user.id, async (db) => {
      const rows = await db.query.jobAlerts.findMany({
        where: eq(jobAlerts.userId, user.id),
        orderBy: [desc(jobAlerts.createdAt)],
        limit: 50,
        with: { job: { columns: { title: true }, with: { company: { columns: { name: true } } } } },
      });
      return {
        schemaReady: true,
        alerts: rows.map((row) => ({
          id: row.id,
          jobId: row.jobId,
          title: row.job?.title ?? "Role",
          companyName: row.job?.company?.name ?? "Company",
          status: row.status,
          fitScore: row.fitScore,
          postedAt: row.postedAt?.toISOString() ?? null,
          sentAt: row.sentAt?.toISOString() ?? null,
          queuedUntil: row.queuedUntil?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    });
  } catch (error) {
    if (isMissingDatabaseRelation(error, "job_alerts")) {
      return { schemaReady: false, alerts: [] };
    }
    throw error;
  }
}
