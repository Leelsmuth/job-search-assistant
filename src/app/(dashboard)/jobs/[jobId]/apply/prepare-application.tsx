"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  draftPreparedAnswers,
  getPreparedApplication,
  markPreparedApplicationApplied,
  savePreparedAnswers,
} from "@/server/actions/apply-actions";
import { exportCoverLetter, exportSavedResume } from "@/server/actions/document-actions";
import { fillerPayload } from "@/modules/apply/filler";
import type { PreparedAnswer, PreparedApplication } from "@/modules/apply/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

function downloadBase64(filename: string, mimeType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const SOURCE_LABEL: Record<PreparedAnswer["valueSource"], string> = {
  profile: "Profile",
  saved: "Saved answer",
  draft: "Drafted",
  edited: "Edited",
  cover_letter: "Cover letter",
  empty: "Needs an answer",
};

function answerControl(answer: PreparedAnswer, onChange: (value: string) => void) {
  if (answer.kind === "file") return null;
  if (answer.type === "long_text" || answer.kind === "open_ended" || answer.kind === "cover_letter") {
    return (
      <Textarea
        aria-label={answer.label}
        value={answer.answer}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Input
      aria-label={answer.label}
      value={answer.answer}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function PrepareApplication({ initial }: { initial: PreparedApplication }) {
  const router = useRouter();
  const { toast } = useToast();
  const [packet, setPacket] = useState(initial);
  const [answers, setAnswers] = useState(initial.answers);
  const [drafting, setDrafting] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState(
    initial.answers.filter((answer) => answer.needsDraft).map((answer) => answer.questionId).join("|")
  );

  useEffect(() => {
    if (!draftKey) return;
    let cancelled = false;
    setDrafting(true);
    draftPreparedAnswers(packet.jobId)
      .then((next) => {
        if (cancelled || !next) return;
        setAnswers((current) =>
          current.map((answer) => {
            const updated = next.answers.find((item) => item.questionId === answer.questionId);
            if (!updated || !answer.needsDraft) return answer;
            if (answer.answer.trim()) return answer;
            return updated;
          })
        );
        setDraftKey("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast({
          title: "Could not draft answers",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setDrafting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draftKey, packet.jobId, toast]);

  function updateAnswer(questionId: string, value: string) {
    setAnswers((current) =>
      current.map((answer) =>
        answer.questionId === questionId ? { ...answer, answer: value, valueSource: "edited" } : answer
      )
    );
  }

  async function copyText(value: string, title: string) {
    await navigator.clipboard.writeText(value);
    toast({ title });
  }

  const payload = fillerPayload({ provider: packet.provider, applyUrl: packet.applyUrl, answers });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 min-h-10">
        <Link href={`/jobs/${packet.jobId}`}>← Back to job</Link>
      </Button>
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Prepare application</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {packet.jobTitle} · {packet.companyName}
        </p>
        <p className="mt-3 text-sm">
          Nothing is submitted automatically. Review every answer, open the employer form, then submit it yourself.
        </p>
      </div>

      {!packet.profileReady ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-950">
            Add your legal name and email in{" "}
            <Link href="/settings" className="underline">
              Settings → Application profile
            </Link>{" "}
            so contact fields can be filled in.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employer form</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Source: {packet.provider} · {packet.formSource === "api" ? "published questions" : "standard questions"}
            {packet.fetchedAt ? ` · cached ${new Date(packet.fetchedAt).toLocaleString()}` : ""}
          </p>
          {packet.formNote ? <p className="text-muted-foreground">{packet.formNote}</p> : null}
          {drafting ? <p>Drafting open-ended answers from your profile evidence…</p> : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={pending === "refresh"}
            onClick={() => {
              setPending("refresh");
              getPreparedApplication(packet.jobId, true)
                .then((next) => {
                  if (!next) return;
                  setPacket(next);
                  setAnswers(next.answers);
                  setDraftKey(
                    next.answers.filter((answer) => answer.needsDraft).map((answer) => answer.questionId).join("|")
                  );
                  toast({ title: "Questions refreshed" });
                })
                .catch((error: unknown) => {
                  toast({
                    title: "Could not refresh questions",
                    description: error instanceof Error ? error.message : "Unknown error",
                    variant: "destructive",
                  });
                })
                .finally(() => setPending(null));
            }}
          >
            Refresh questions
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resume and cover letter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {packet.resume ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-2">{packet.resume.name}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={pending === "resume-pdf"}
                onClick={() => {
                  if (!packet.resume) return;
                  setPending("resume-pdf");
                  exportSavedResume(packet.jobId, packet.resume.id, "pdf")
                    .then((file) => downloadBase64(file.filename, file.mimeType, file.base64))
                    .catch((error: unknown) => {
                      toast({
                        title: "PDF download failed",
                        description: error instanceof Error ? error.message : "Unknown error",
                        variant: "destructive",
                      });
                    })
                    .finally(() => setPending(null));
                }}
              >
                Download resume PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={pending === "resume-docx"}
                onClick={() => {
                  if (!packet.resume) return;
                  setPending("resume-docx");
                  exportSavedResume(packet.jobId, packet.resume.id, "docx")
                    .then((file) => downloadBase64(file.filename, file.mimeType, file.base64))
                    .catch((error: unknown) => {
                      toast({
                        title: "DOCX download failed",
                        description: error instanceof Error ? error.message : "Unknown error",
                        variant: "destructive",
                      });
                    })
                    .finally(() => setPending(null));
                }}
              >
                Download resume DOCX
              </Button>
            </div>
          ) : (
            <p>
              No tailored resume yet.{" "}
              <Link className="underline" href={`/jobs/${packet.jobId}?tab=documents`}>
                Generate one
              </Link>
              .
            </p>
          )}
          {packet.coverLetter ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-2">Cover letter ready</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={pending === "letter-pdf"}
                onClick={() => {
                  if (!packet.coverLetter) return;
                  setPending("letter-pdf");
                  exportCoverLetter(packet.jobId, packet.coverLetter.body, "pdf")
                    .then((file) => downloadBase64(file.filename, file.mimeType, file.base64))
                    .catch((error: unknown) => {
                      toast({
                        title: "Cover letter download failed",
                        description: error instanceof Error ? error.message : "Unknown error",
                        variant: "destructive",
                      });
                    })
                    .finally(() => setPending(null));
                }}
              >
                Download cover letter PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={pending === "letter-docx"}
                onClick={() => {
                  if (!packet.coverLetter) return;
                  setPending("letter-docx");
                  exportCoverLetter(packet.jobId, packet.coverLetter.body, "docx")
                    .then((file) => downloadBase64(file.filename, file.mimeType, file.base64))
                    .catch((error: unknown) => {
                      toast({
                        title: "Cover letter download failed",
                        description: error instanceof Error ? error.message : "Unknown error",
                        variant: "destructive",
                      });
                    })
                    .finally(() => setPending(null));
                }}
              >
                Download cover letter DOCX
              </Button>
            </div>
          ) : (
            <p>
              No cover letter yet.{" "}
              <Link className="underline" href={`/jobs/${packet.jobId}?tab=documents`}>
                Generate one
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {answers.map((answer) => (
          <Card key={answer.questionId}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span>
                  {answer.label}
                  {answer.required ? <span className="text-destructive"> *</span> : null}
                </span>
                <Badge className="border border-border bg-transparent font-normal">
                  {SOURCE_LABEL[answer.valueSource]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {answer.note ? <p className="text-sm text-muted-foreground">{answer.note}</p> : null}
              {answerControl(answer, (value) => updateAnswer(answer.questionId, value))}
              {answer.unsupportedClaims.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
                  {answer.unsupportedClaims.map((claim) => (
                    <li key={claim}>{claim}</li>
                  ))}
                </ul>
              ) : null}
              {answer.kind !== "file" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(answer.answer, "Answer copied")}
                >
                  Copy answer
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => copyText(payload, "Filler payload copied")}
        >
          Copy filler payload
        </Button>
        <Button
          type="button"
          variant="outline"
          loading={pending === "save"}
          onClick={() => {
            setPending("save");
            savePreparedAnswers(
              packet.jobId,
              answers.map((answer) => ({ questionId: answer.questionId, answer: answer.answer }))
            )
              .then((next) => {
                if (next) {
                  setPacket(next);
                  setAnswers(next.answers);
                }
                toast({ title: "Answers saved" });
              })
              .catch((error: unknown) => {
                toast({
                  title: "Could not save answers",
                  description: error instanceof Error ? error.message : "Unknown error",
                  variant: "destructive",
                });
              })
              .finally(() => setPending(null));
          }}
        >
          Save answers
        </Button>
        {packet.applyUrl ? (
          <Button type="button" asChild>
            <a href={packet.applyUrl} target="_blank" rel="noopener noreferrer">
              Open application
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        ) : (
          <Button type="button" disabled>
            No apply link
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          loading={pending === "applied"}
          onClick={() => {
            setPending("applied");
            markPreparedApplicationApplied(
              packet.jobId,
              answers.map((answer) => ({ questionId: answer.questionId, answer: answer.answer }))
            )
              .then((result) => {
                router.refresh();
                toast({
                  title: result.alreadyApplied ? "Already applied" : "Marked as applied",
                  description: "The employer form was not submitted. The answers you used are saved on the application.",
                });
              })
              .catch((error: unknown) => {
                toast({
                  title: "Could not mark as applied",
                  description: error instanceof Error ? error.message : "Unknown error",
                  variant: "destructive",
                });
              })
              .finally(() => setPending(null));
          }}
        >
          Mark as applied
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        <Link href="/settings/apply-assist" className="underline">
          Form filler script
        </Link>{" "}
        can paste known Greenhouse, Lever, and Ashby fields after you copy the payload. It skips file uploads and does not click Submit.
      </p>
    </div>
  );
}
