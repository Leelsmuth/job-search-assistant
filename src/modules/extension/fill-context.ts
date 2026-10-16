import { and, desc, eq } from "drizzle-orm";
import {
  applicationAnswers,
  applicationProfiles,
  applications,
  coverLetters,
  jobApplicationForms,
  jobs,
  resumeDocuments,
  resumeVersions,
} from "@/db/schema";
import { applicationProfileFromRow } from "@/modules/apply/profile";
import type { ApplicationProfile } from "@/modules/apply/types";
import type { PreparedFillAnswer } from "@/modules/extension/page-types";
import {
  detectPageProvider,
  sourceJobIdFromUrl,
  urlsReferToSameJob,
  type PageProvider,
} from "@/modules/extension/urls";
import type { Db } from "@/server/actions/helpers";

export type ExtensionFillContext = {
  provider: PageProvider;
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    url: string | null;
    alreadyApplied: boolean;
  } | null;
  profile: ApplicationProfile;
  preparedAnswers: PreparedFillAnswer[];
  documents: {
    resume: { available: boolean; source: "tailored" | "default" | null; filename: string | null };
    coverLetter: { available: boolean; filename: string | null };
  };
  coverLetterBody: string | null;
};

type JobRow = {
  id: string;
  title: string;
  location: string | null;
  jobUrl: string | null;
  sourceJobId: string | null;
  company: { name: string } | null;
};

function preparedFromAnswers(
  rows: Array<{ question: string; draftAnswer: string | null; finalAnswer: string | null }>
): PreparedFillAnswer[] {
  return rows.flatMap((row) => {
    const answer = (row.finalAnswer ?? row.draftAnswer ?? "").trim();
    if (!row.question.trim() || !answer) return [];
    return [{ label: row.question.trim(), answer: answer.slice(0, 8000) }];
  });
}

function sameSourceId(stored: string | null, pageUrl: string): boolean {
  if (!stored) return false;
  const pageId = sourceJobIdFromUrl(pageUrl);
  if (!pageId) return false;
  const norm = (value: string) => value.toLowerCase().replace(/-/g, "");
  return norm(stored) === norm(pageId);
}

export async function loadExtensionFillContext(
  db: Db,
  userId: string,
  pageUrl: string
): Promise<ExtensionFillContext> {
  const provider = detectPageProvider(pageUrl);
  const profileRow = await db.query.applicationProfiles.findFirst({
    where: eq(applicationProfiles.userId, userId),
  });
  const profile = applicationProfileFromRow(profileRow);

  const jobRows = await db.query.jobs.findMany({
    where: eq(jobs.userId, userId),
    columns: {
      id: true,
      title: true,
      location: true,
      jobUrl: true,
      sourceJobId: true,
    },
    with: { company: { columns: { name: true } } },
  });

  let matched: JobRow | null =
    jobRows.find((job) => job.jobUrl && urlsReferToSameJob(job.jobUrl, pageUrl)) ??
    jobRows.find((job) => sameSourceId(job.sourceJobId, pageUrl)) ??
    null;

  if (!matched) {
    const forms = await db.query.jobApplicationForms.findMany({
      where: eq(jobApplicationForms.userId, userId),
      columns: { jobId: true, applyUrl: true },
    });
    const form = forms.find((item) => item.applyUrl && urlsReferToSameJob(item.applyUrl, pageUrl));
    if (form) matched = jobRows.find((job) => job.id === form.jobId) ?? null;
  }

  let preparedAnswers: PreparedFillAnswer[] = [];
  let alreadyApplied = false;
  let coverLetterBody: string | null = null;
  let coverFilename: string | null = null;
  let tailoredName: string | null = null;
  let hasTailored = false;

  if (matched) {
    const application = await db.query.applications.findFirst({
      where: and(eq(applications.userId, userId), eq(applications.jobId, matched.id)),
      columns: { id: true, status: true },
    });
    alreadyApplied = application?.status === "applied";
    if (application) {
      const answers = await db.query.applicationAnswers.findMany({
        where: eq(applicationAnswers.applicationId, application.id),
        columns: { question: true, draftAnswer: true, finalAnswer: true },
      });
      preparedAnswers = preparedFromAnswers(answers);
    }
    const letter = await db.query.coverLetters.findFirst({
      where: and(eq(coverLetters.userId, userId), eq(coverLetters.jobId, matched.id)),
      orderBy: [desc(coverLetters.updatedAt)],
      columns: { body: true },
    });
    if (letter?.body.trim()) {
      coverLetterBody = letter.body.trim().slice(0, 20000);
      coverFilename = "cover-letter.pdf";
    }
    const tailored = await db.query.resumeVersions.findFirst({
      where: and(eq(resumeVersions.userId, userId), eq(resumeVersions.jobId, matched.id)),
      orderBy: [desc(resumeVersions.updatedAt)],
      columns: { name: true, contentJson: true, contentText: true },
    });
    hasTailored = Boolean(tailored && (tailored.contentJson || tailored.contentText?.trim()));
    if (hasTailored) tailoredName = tailored?.name?.trim() || "resume.pdf";
  }

  const master = await db.query.resumeVersions.findFirst({
    where: and(eq(resumeVersions.userId, userId), eq(resumeVersions.versionType, "master")),
    orderBy: [desc(resumeVersions.updatedAt)],
    columns: { name: true, contentText: true, contentJson: true },
  });
  const document = await db.query.resumeDocuments.findFirst({
    where: eq(resumeDocuments.userId, userId),
    orderBy: [desc(resumeDocuments.createdAt)],
    columns: { fileName: true, storagePath: true, extractedText: true },
  });
  const hasDefault = Boolean(
    document?.storagePath ||
      document?.extractedText?.trim() ||
      master?.contentText?.trim() ||
      master?.contentJson
  );

  const resumeAvailable = hasTailored || hasDefault;
  const resumeSource = hasTailored ? "tailored" : hasDefault ? "default" : null;
  const resumeFilename = hasTailored
    ? ensurePdfName(tailoredName || "resume.pdf")
    : hasDefault
      ? ensurePdfName(document?.fileName || master?.name || "resume.pdf")
      : null;

  return {
    provider,
    job: matched
      ? {
          id: matched.id,
          title: matched.title,
          company: matched.company?.name ?? "Company",
          location: matched.location,
          url: matched.jobUrl,
          alreadyApplied,
        }
      : null,
    profile,
    preparedAnswers,
    documents: {
      resume: { available: resumeAvailable, source: resumeSource, filename: resumeFilename },
      coverLetter: { available: Boolean(coverLetterBody), filename: coverFilename },
    },
    coverLetterBody,
  };
}

function ensurePdfName(name: string): string {
  const base = name.replace(/\.(docx|txt|pdf)$/i, "");
  return `${base}.pdf`.replace(/[^\w.\- ]+/g, "").trim() || "resume.pdf";
}
