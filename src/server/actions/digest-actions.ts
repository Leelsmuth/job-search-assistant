"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { jobDigests, searchPreferences } from "@/db/schema";
import { withUserDb } from "@/db/user-context";
import { getUser } from "@/lib/supabase/server";
import { defaultSearchPreferences } from "@/modules/matching/search-preferences";
import { isMissingDigestSchema } from "@/modules/digest/schema-error";
import {
  DIGEST_SKIP_REASONS,
  type DigestPageState,
  type DigestPayload,
  type DigestSkipReason,
} from "@/modules/digest/types";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

const SCHEMA_MESSAGE =
  "Apply migration 0016_job_digests.sql in the Supabase SQL editor before using the daily digest.";

export async function getDigestSettings(): Promise<{
  schemaReady: boolean;
  emailsEnabled: boolean;
  lastSentAt: string | null;
}> {
  const user = await requireUser();
  try {
    return await withUserDb(user.id, async (db) => {
      const row = await db.query.searchPreferences.findFirst({
        where: eq(searchPreferences.userId, user.id),
        columns: { digestEmailsEnabled: true, digestLastSentAt: true },
      });
      return {
        schemaReady: true,
        emailsEnabled: row?.digestEmailsEnabled ?? true,
        lastSentAt: row?.digestLastSentAt?.toISOString() ?? null,
      };
    });
  } catch (error) {
    if (isMissingDigestSchema(error)) {
      return { schemaReady: false, emailsEnabled: true, lastSentAt: null };
    }
    throw error;
  }
}

export async function getDigestPageData(): Promise<DigestPageState> {
  const user = await requireUser();
  try {
    return await withUserDb(user.id, async (db) => {
      const settings = await db.query.searchPreferences.findFirst({
        where: eq(searchPreferences.userId, user.id),
        columns: { digestEmailsEnabled: true, digestLastSentAt: true },
      });
      const latest = await db.query.jobDigests.findFirst({
        where: eq(jobDigests.userId, user.id),
        orderBy: [desc(jobDigests.generatedAt)],
      });
      const payload = latest ? parseDigestPayload(latest.payload) : null;
      return {
        schemaReady: true,
        emailsEnabled: settings?.digestEmailsEnabled ?? true,
        lastSentAt: settings?.digestLastSentAt?.toISOString() ?? null,
        digest:
          latest && payload
            ? {
                generatedAt: latest.generatedAt.toISOString(),
                emailedAt: latest.emailedAt?.toISOString() ?? null,
                skipReason: asSkipReason(latest.skipReason),
                subject: latest.subject,
                payload,
              }
            : null,
      };
    });
  } catch (error) {
    if (isMissingDigestSchema(error)) {
      return { schemaReady: false, emailsEnabled: true, lastSentAt: null, digest: null };
    }
    throw error;
  }
}

export async function setDigestEmailsEnabled(enabled: boolean) {
  if (typeof enabled !== "boolean") throw new Error("Invalid digest setting");
  const user = await requireUser();
  try {
    await withUserDb(user.id, async (db) => {
      const existing = await db.query.searchPreferences.findFirst({
        where: eq(searchPreferences.userId, user.id),
        columns: { userId: true },
      });
      if (existing) {
        await db
          .update(searchPreferences)
          .set({ digestEmailsEnabled: enabled, updatedAt: new Date() })
          .where(eq(searchPreferences.userId, user.id));
        return;
      }
      const prefs = defaultSearchPreferences();
      await db.insert(searchPreferences).values({
        userId: user.id,
        targetTitles: prefs.targetTitles,
        preferredSeniority: prefs.preferredSeniority,
        minimumSalaryCad: prefs.minimumSalaryCad,
        includeHybridGta: prefs.includeHybridGta,
        includeOnsiteGta: prefs.includeOnsiteGta,
        showRemoteOther: prefs.showRemoteOther,
        showOutOfArea: prefs.showOutOfArea,
        discoverCuratedBoards: prefs.discoverCuratedBoards,
        gtaCities: prefs.gtaCities,
        digestEmailsEnabled: enabled,
        updatedAt: new Date(),
      });
    });
  } catch (error) {
    if (isMissingDigestSchema(error)) throw new Error(SCHEMA_MESSAGE);
    throw error;
  }
  revalidatePath("/settings");
  revalidatePath("/digest");
}

function asSkipReason(value: string | null): DigestSkipReason | null {
  if (value && (DIGEST_SKIP_REASONS as readonly string[]).includes(value)) {
    return value as DigestSkipReason;
  }
  return null;
}

function parseDigestPayload(value: unknown): DigestPayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.jobs) || !Array.isArray(record.followUps) || !Array.isArray(record.staleApplied)) {
    return null;
  }
  return {
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : "",
    windowStart: typeof record.windowStart === "string" ? record.windowStart : "",
    windowEnd: typeof record.windowEnd === "string" ? record.windowEnd : "",
    jobs: record.jobs.flatMap(parseMatch),
    followUps: record.followUps.flatMap(parseFollowUp),
    staleApplied: record.staleApplied.flatMap(parseStale),
  };
}

function parseMatch(value: unknown) {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return [];
  return [
    {
      id: value.id,
      title: value.title,
      companyName: typeof value.companyName === "string" ? value.companyName : "Company not set",
      locationLabel: typeof value.locationLabel === "string" ? value.locationLabel : "",
      score: typeof value.score === "number" ? value.score : 0,
      reason: typeof value.reason === "string" ? value.reason : null,
      href: typeof value.href === "string" && value.href.startsWith("/jobs/") ? value.href : `/jobs/${value.id}`,
      postingUrl: typeof value.postingUrl === "string" ? value.postingUrl : null,
    },
  ];
}

function parseFollowUp(value: unknown) {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return [];
  return [
    {
      id: value.id,
      jobId: typeof value.jobId === "string" ? value.jobId : "",
      title: value.title,
      companyName: typeof value.companyName === "string" ? value.companyName : "Company not set",
      followUpDate: typeof value.followUpDate === "string" ? value.followUpDate : "",
      overdue: value.overdue === true,
      href:
        typeof value.href === "string" && value.href.startsWith("/applications/")
          ? value.href
          : `/applications/${value.id}`,
    },
  ];
}

function parseStale(value: unknown) {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return [];
  return [
    {
      id: value.id,
      jobId: typeof value.jobId === "string" ? value.jobId : "",
      title: value.title,
      companyName: typeof value.companyName === "string" ? value.companyName : "Company not set",
      dateApplied: typeof value.dateApplied === "string" ? value.dateApplied : "",
      daysQuiet: typeof value.daysQuiet === "number" ? value.daysQuiet : 14,
      href:
        typeof value.href === "string" && value.href.startsWith("/applications/")
          ? value.href
          : `/applications/${value.id}`,
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
