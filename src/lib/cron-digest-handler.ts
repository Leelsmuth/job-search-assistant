import { getDb } from "@/db/client";
import { withUserDb } from "@/db/user-context";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runWithPerfContextAsync } from "@/lib/performance/request-context";
import { buildDigestForUser, markDigestSent, recordDigestSkip } from "@/modules/digest/build";
import { renderDigestEmail, sendDigestEmail } from "@/modules/digest/email";
import { lookupAuthEmail, listDigestUserIds } from "@/modules/digest/recipients";
import { isMissingDigestSchema } from "@/modules/digest/schema-error";
import { decideDigestDelivery, digestAppBaseUrl, isResendConfigured } from "@/modules/digest/select";
import type { DigestSkipReason } from "@/modules/digest/types";

export type DigestRunSummary = {
  ok: boolean;
  schemaReady: boolean;
  users: number;
  stored: number;
  emailed: number;
  empty: number;
  failed: number;
  skipped: Record<DigestSkipReason, number>;
};

function emptySummary(): DigestRunSummary {
  return {
    ok: true,
    schemaReady: true,
    users: 0,
    stored: 0,
    emailed: 0,
    empty: 0,
    failed: 0,
    skipped: {
      emails_disabled: 0,
      already_sent_today: 0,
      resend_not_configured: 0,
      missing_recipient: 0,
      send_failed: 0,
    },
  };
}

export async function runDailyDigest(now = new Date()): Promise<DigestRunSummary> {
  return runWithPerfContextAsync("cron.digest", async () => {
    const db = getDb();
    const userIds = await listDigestUserIds(db);
    const summary = emptySummary();
    const baseUrl = digestAppBaseUrl();

    for (const userId of userIds) {
      let built: Awaited<ReturnType<typeof buildDigestForUser>>;
      try {
        built = await withUserDb(userId, (userDb) => buildDigestForUser(userDb, userId, now));
      } catch (error) {
        if (isMissingDigestSchema(error)) {
          console.error(
            "[digest] Apply drizzle/migrations/0016_job_digests.sql before the daily digest can run.",
            error
          );
          return { ...summary, ok: false, schemaReady: false };
        }
        console.error("[digest] failed to build digest", { userId, error });
        summary.failed += 1;
        continue;
      }

      summary.users += 1;
      if (built.outcome === "empty") {
        summary.empty += 1;
        console.info("[digest] nothing new and no reminders; skipping email", { userId });
        continue;
      }

      summary.stored += 1;
      const decision = decideDigestDelivery({
        emailsEnabled: built.emailsEnabled,
        alreadySentToday: built.alreadySentToday,
        resendConfigured: isResendConfigured(),
      });

      if (!decision.send) {
        if (decision.reason === "resend_not_configured") {
          console.info(
            "[digest] RESEND_API_KEY or DIGEST_FROM_EMAIL is not set. Skipping email.",
            { userId }
          );
        } else {
          console.info("[digest] skipped email", { userId, reason: decision.reason });
        }
        await withUserDb(userId, (userDb) =>
          recordDigestSkip(userDb, userId, built.digestId, decision.reason)
        );
        summary.skipped[decision.reason] += 1;
        continue;
      }

      const email = await lookupAuthEmail(db, userId);
      const message = renderDigestEmail(built.payload, baseUrl);
      const sent = await sendDigestEmail({ to: email ?? "", ...message });
      if (!sent.ok) {
        await withUserDb(userId, (userDb) => recordDigestSkip(userDb, userId, built.digestId, sent.reason));
        summary.skipped[sent.reason] += 1;
        continue;
      }

      try {
        await withUserDb(userId, (userDb) => markDigestSent(userDb, userId, built.digestId, new Date()));
      } catch (error) {
        console.error("[digest] email sent but the send time was not saved", { userId, error });
      }
      summary.emailed += 1;
    }

    return summary;
  });
}

export async function handleCronDigestRequest(
  authHeader: string | null
): Promise<{ status: number; body: Record<string, unknown> }> {
  const auth = verifyCronAuth(authHeader);
  if (!auth.ok) {
    return { status: auth.status, body: { error: auth.error } };
  }

  try {
    const summary = await runDailyDigest();
    return { status: 200, body: summary };
  } catch (error) {
    console.error("[digest] cron failed", error);
    return { status: 500, body: { error: "Digest failed" } };
  }
}
