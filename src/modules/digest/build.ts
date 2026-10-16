import { and, desc, eq, gt, ne } from "drizzle-orm";
import { candidateProfiles, jobDigests, jobs, searchPreferences } from "@/db/schema";
import type { Db } from "@/server/actions/helpers";
import { listTrackedApplications } from "@/modules/applications/store";
import {
  defaultSearchPreferences,
  searchPreferencesFromRow,
  type SearchPreferences,
} from "@/modules/matching/search-preferences";
import type { FrontendFitProfile } from "@/modules/matching/frontend-fit";
import { loadDefaultResumeText } from "@/modules/resume-score/load";
import { scoreResumeMatch } from "@/modules/resume-score/score";
import {
  digestHasContent,
  digestSubject,
  resolveDigestWindow,
  selectDigestJobs,
  selectDigestReminders,
  wasDigestSentToday,
} from "@/modules/digest/select";
import type { DigestPayload, DigestSkipReason } from "@/modules/digest/types";

const DIGEST_JOB_FETCH_LIMIT = 300;

export type DigestBuildResult =
  | { outcome: "empty" }
  | {
      outcome: "stored";
      digestId: string;
      payload: DigestPayload;
      subject: string;
      emailsEnabled: boolean;
      alreadySentToday: boolean;
    };

export async function buildDigestForUser(db: Db, userId: string, now: Date): Promise<DigestBuildResult> {
  const preferenceRow = await db.query.searchPreferences.findFirst({
    where: eq(searchPreferences.userId, userId),
    columns: {
      targetTitles: true,
      preferredSeniority: true,
      minimumSalaryCad: true,
      minFitToShow: true,
      digestMinFit: true,
      includeHybridGta: true,
      includeOnsiteGta: true,
      showRemoteOther: true,
      showOutOfArea: true,
      discoverCuratedBoards: true,
      gtaCities: true,
      digestEmailsEnabled: true,
      digestLastSentAt: true,
      digestLastGeneratedAt: true,
    },
  });
  const prefs = preferenceRow ? searchPreferencesFromRow(preferenceRow) : defaultSearchPreferences();
  const emailsEnabled = preferenceRow?.digestEmailsEnabled ?? true;
  const lastSentAt = preferenceRow?.digestLastSentAt ?? null;
  const lastGeneratedAt = preferenceRow?.digestLastGeneratedAt ?? null;

  const latest = await db.query.jobDigests.findFirst({
    where: eq(jobDigests.userId, userId),
    orderBy: [desc(jobDigests.generatedAt)],
    columns: { generatedAt: true, windowStart: true },
  });

  const window = resolveDigestWindow({
    now,
    lastGeneratedAt,
    openDigest: latest ?? null,
  });

  const rows = await db.query.jobs.findMany({
    where: and(
      eq(jobs.userId, userId),
      ne(jobs.status, "dismissed"),
      gt(jobs.dateDiscovered, window.windowStart)
    ),
    orderBy: [desc(jobs.dateDiscovered)],
    limit: DIGEST_JOB_FETCH_LIMIT,
    columns: {
      id: true,
      title: true,
      location: true,
      workplaceType: true,
      description: true,
      technologies: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      jobUrl: true,
      dateDiscovered: true,
      status: true,
      locationEligibility: true,
      frontendFitScore: true,
      frontendFitReasons: true,
      fitScore: true,
      fitEligible: true,
    },
    with: {
      company: { columns: { name: true } },
    },
  });

  let profile: FrontendFitProfile = {
    targetTitles: prefs.targetTitles,
    preferredSeniority: prefs.preferredSeniority,
    minimumSalaryCad: prefs.minimumSalaryCad,
  };
  const needsProfile = rows.some((row) => row.fitScore == null);
  const resumeDocument = await loadDefaultResumeText(db, userId);
  if (needsProfile || resumeDocument) {
    const profileRow = await db.query.candidateProfiles.findFirst({
      where: eq(candidateProfiles.userId, userId),
      columns: { preferredSeniority: true, minimumSalary: true, yearsExperience: true, targetTitles: true },
      with: { skills: { columns: { name: true } } },
    });
    profile = {
      skills: profileRow?.skills.map((skill) => skill.name) ?? [],
      targetTitles: prefs.targetTitles.length > 0 ? prefs.targetTitles : (profileRow?.targetTitles as string[] | undefined),
      preferredSeniority: prefs.preferredSeniority ?? profileRow?.preferredSeniority,
      yearsExperience: profileRow?.yearsExperience,
      minimumSalaryCad: prefs.minimumSalaryCad ?? profileRow?.minimumSalary ?? null,
    };
  }

  const resumeScores = new Map<string, number>();
  if (resumeDocument) {
    for (const row of rows) {
      resumeScores.set(
        row.id,
        scoreResumeMatch(
          {
            title: row.title,
            description: row.description,
            technologies: row.technologies,
          },
          { text: resumeDocument.text, fileType: resumeDocument.fileType },
          { skills: profile.skills, yearsExperience: profile.yearsExperience }
        ).overall
      );
    }
  }

  const matches = selectDigestJobs({
    jobs: rows.map((row) => ({
      id: row.id,
      title: row.title,
      companyName: row.company?.name ?? "Company not set",
      location: row.location,
      workplaceType: row.workplaceType,
      description: row.description,
      technologies: row.technologies,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      salaryCurrency: row.salaryCurrency,
      jobUrl: row.jobUrl,
      dateDiscovered: row.dateDiscovered,
      status: row.status,
      locationEligibility: row.locationEligibility,
      frontendFitScore: row.frontendFitScore,
      frontendFitReasons: row.frontendFitReasons,
      fitScore: row.fitScore,
      fitEligible: row.fitEligible,
      resumeScore: resumeScores.get(row.id) ?? null,
    })),
    visibility: prefs,
    gtaCities: prefs.gtaCities,
    profile,
    minScore: prefs.digestMinFit,
  });

  const tracked = await listTrackedApplications(db, userId, now);
  const reminders = selectDigestReminders(
    tracked.map((application) => ({
      id: application.id,
      jobId: application.jobId,
      status: application.status,
      title: application.title,
      companyName: application.companyName,
      dateApplied: application.dateApplied ? new Date(application.dateApplied) : null,
      followUpDate: application.followUpDate ? new Date(application.followUpDate) : null,
      lastActivityAt: new Date(application.lastActivityAt),
    })),
    now
  );

  if (!digestHasContent({ jobs: matches, ...reminders })) {
    return { outcome: "empty" };
  }

  const payload: DigestPayload = {
    generatedAt: now.toISOString(),
    windowStart: window.windowStart.toISOString(),
    windowEnd: window.windowEnd.toISOString(),
    jobs: matches,
    followUps: reminders.followUps,
    staleApplied: reminders.staleApplied,
  };
  const subject = digestSubject({
    jobs: matches.length,
    reminders: reminders.followUps.length + reminders.staleApplied.length,
  });

  const [stored] = await db
    .insert(jobDigests)
    .values({
      userId,
      generatedAt: now,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      subject,
      payload,
    })
    .returning({ id: jobDigests.id });

  await writeDigestPreferences(db, userId, prefs, preferenceRow != null, {
    digestLastGeneratedAt: now,
    updatedAt: now,
  });

  return {
    outcome: "stored",
    digestId: stored.id,
    payload,
    subject,
    emailsEnabled,
    alreadySentToday: wasDigestSentToday(lastSentAt, now),
  };
}

export async function recordDigestSkip(
  db: Db,
  userId: string,
  digestId: string,
  reason: DigestSkipReason
): Promise<void> {
  await db
    .update(jobDigests)
    .set({ skipReason: reason, emailedAt: null })
    .where(and(eq(jobDigests.id, digestId), eq(jobDigests.userId, userId)));
}

export async function markDigestSent(
  db: Db,
  userId: string,
  digestId: string,
  sentAt: Date
): Promise<void> {
  await db
    .update(jobDigests)
    .set({ emailedAt: sentAt, skipReason: null })
    .where(and(eq(jobDigests.id, digestId), eq(jobDigests.userId, userId)));

  const existing = await db.query.searchPreferences.findFirst({
    where: eq(searchPreferences.userId, userId),
    columns: { userId: true },
  });
  if (!existing) return;
  await db
    .update(searchPreferences)
    .set({ digestLastSentAt: sentAt, updatedAt: sentAt })
    .where(eq(searchPreferences.userId, userId));
}

async function writeDigestPreferences(
  db: Db,
  userId: string,
  prefs: SearchPreferences,
  exists: boolean,
  patch: { digestLastGeneratedAt: Date; updatedAt: Date }
) {
  if (exists) {
    await db.update(searchPreferences).set(patch).where(eq(searchPreferences.userId, userId));
    return;
  }
  await db.insert(searchPreferences).values({
    userId,
    targetTitles: prefs.targetTitles,
    preferredSeniority: prefs.preferredSeniority,
    minimumSalaryCad: prefs.minimumSalaryCad,
    includeHybridGta: prefs.includeHybridGta,
    includeOnsiteGta: prefs.includeOnsiteGta,
    showRemoteOther: prefs.showRemoteOther,
    showOutOfArea: prefs.showOutOfArea,
    discoverCuratedBoards: prefs.discoverCuratedBoards,
    gtaCities: prefs.gtaCities,
    digestEmailsEnabled: true,
    digestLastGeneratedAt: patch.digestLastGeneratedAt,
    updatedAt: patch.updatedAt,
  });
}
