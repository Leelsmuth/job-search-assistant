"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { usePendingTransition } from "@/components/layout/action-pending-provider";
import {
  exportCoverLetter,
  exportResumeDraft,
  exportSavedResume,
  generateCoverLetter,
  generateTailoredResume,
  getJobDocuments,
  saveCoverLetter,
  saveTailoredResume,
} from "@/server/actions/document-actions";
import {
  buildResumePreview,
  masterResumeFromDraft,
  setAllDecisions,
  setBulletText,
  setChangeDecision,
  setSummary,
} from "@/modules/documents/resolve-resume";
import { renderResumePlainText } from "@/modules/documents/render-resume";
import { countWords } from "@/modules/documents/text";
import type { TailoredResumeDraft } from "@/modules/documents/types";

type DocumentsState = Awaited<ReturnType<typeof getJobDocuments>>;
type CoverLetter = NonNullable<DocumentsState["coverLetter"]>;

function downloadBase64(filename: string, mimeType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function DocumentsPanel({ jobId }: { jobId: string }) {
  const { toast } = useToast();
  const { isPending, run } = usePendingTransition();
  const [loaded, setLoaded] = useState<DocumentsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TailoredResumeDraft | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [letterBody, setLetterBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    getJobDocuments(jobId)
      .then((data) => {
        if (cancelled) return;
        setLoaded(data);
        setDraft(data.draft);
        setVersionId(data.versionId);
        setLetter(data.coverLetter);
        setLetterBody(data.coverLetter?.body ?? "");
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Failed to load documents");
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const masterText = useMemo(
    () => (draft ? renderResumePlainText(masterResumeFromDraft(draft)) : ""),
    [draft]
  );
  const preview = useMemo(() => (draft ? buildResumePreview(draft) : null), [draft]);

  function notify(file: { warnings: string[] }, title: string) {
    toast({
      title,
      description: file.warnings.length ? file.warnings.slice(0, 3).join(" ") : undefined,
    });
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!loaded) return <p className="text-sm text-muted-foreground">Loading documents…</p>;

  const modelLabel = loaded.model;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            loading={isPending}
            onClick={() =>
              run(async () => {
                try {
                  const result = await generateTailoredResume(jobId, false);
                  setDraft(result.draft);
                  setVersionId(result.versionId);
                  setLoaded(await getJobDocuments(jobId));
                  toast({ title: "Resume tailored", description: result.notice ?? undefined });
                } catch (cause) {
                  toast({
                    title: "Could not tailor resume",
                    description: cause instanceof Error ? cause.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              })
            }
          >
            Tailor resume
          </Button>
          <Button
            variant="outline"
            loading={isPending}
            disabled={!loaded.aiAvailable}
            title={loaded.aiAvailable ? `Rewrite with ${modelLabel}` : "Set OPENAI_API_KEY to rewrite bullets"}
            onClick={() =>
              run(async () => {
                try {
                  const result = await generateTailoredResume(jobId, true);
                  setDraft(result.draft);
                  setVersionId(result.versionId);
                  setLoaded(await getJobDocuments(jobId));
                  toast({ title: "Resume tailored", description: result.notice ?? undefined });
                } catch (cause) {
                  toast({
                    title: "Could not rewrite bullets",
                    description: cause instanceof Error ? cause.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              })
            }
          >
            Rewrite bullets with AI
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Selection uses requirement matches and frontend fit. Pending suggestions are already in the
          preview. Reject a change to keep the profile version. Rewrites stay inside the original bullet
          and never add employers, titles, dates, metrics, or skills.
          {loaded.aiAvailable
            ? ` AI rewrites use ${modelLabel}.`
            : " Without OPENAI_API_KEY, only selection and ordering run."}
        </p>

        {draft && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border border-border bg-transparent">{draft.generationMode}</Badge>
              {draft.model ? <Badge className="border border-border bg-transparent">{draft.model}</Badge> : null}
              <span className="text-xs text-muted-foreground">{draft.changes.length} changes</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(setAllDecisions(draft, "accepted"))}
              >
                Accept all
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(setAllDecisions(draft, "rejected"))}
              >
                Reject all
              </Button>
            </div>

            {draft.unsupportedClaims.length > 0 && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="space-y-1 p-4 text-sm text-amber-950">
                  {draft.unsupportedClaims.map((claim) => (
                    <p key={claim}>{claim}</p>
                  ))}
                </CardContent>
              </Card>
            )}

            {draft.changes.length > 0 && (
              <div className="space-y-3">
                {draft.changes.map((change) => (
                  <Card key={change.id}>
                    <CardContent className="space-y-2 p-4 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{change.label}</span>
                        <Badge className="border border-border bg-transparent">{change.decision}</Badge>
                      </div>
                      <p className="break-words text-muted-foreground">Before: {change.before}</p>
                      <p className="break-words">After: {change.after}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={change.decision === "accepted" ? "default" : "outline"}
                          onClick={() => setDraft(setChangeDecision(draft, change.id, "accepted"))}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant={change.decision === "rejected" ? "default" : "outline"}
                          onClick={() => setDraft(setChangeDecision(draft, change.id, "rejected"))}
                        >
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Profile</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{masterText}</pre>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tailored for this job</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-base font-semibold">{draft.header.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {[draft.header.headline, draft.header.location].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <label className="block space-y-1 text-sm">
                    <span className="font-medium">Summary</span>
                    <Textarea
                      value={draft.summary ?? ""}
                      onChange={(event) => setDraft(setSummary(draft, event.target.value))}
                    />
                  </label>
                  {preview?.experiences.map((experience) => (
                    <div key={experience.id} className="space-y-2">
                      <p className="text-sm font-semibold">{experience.heading}</p>
                      {experience.meta ? (
                        <p className="text-xs text-muted-foreground">{experience.meta}</p>
                      ) : null}
                      {experience.bullets.map((bullet) => (
                        <label key={bullet.id} className="block space-y-1 text-sm">
                          <span className="sr-only">Bullet for {experience.heading}</span>
                          <Textarea
                            value={bullet.text}
                            onChange={(event) => setDraft(setBulletText(draft, bullet.id, event.target.value))}
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                  {preview && preview.skills.length > 0 && (
                    <p className="text-sm">
                      <span className="font-medium">Skills: </span>
                      {preview.skills.join(", ")}
                    </p>
                  )}
                  {preview?.projects.map((project) => (
                    <p key={project.id} className="text-sm">
                      <span className="font-medium">{project.name}. </span>
                      {project.description}
                    </p>
                  ))}
                  {preview?.education.map((item) => (
                    <p key={item.id} className="text-sm">{item.line}</p>
                  ))}
                  {preview?.certifications.map((item) => (
                    <p key={item.id} className="text-sm">{item.line}</p>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                loading={isPending}
                onClick={() =>
                  run(async () => {
                    try {
                      const result = await saveTailoredResume(jobId, versionId, draft);
                      setDraft(result.draft);
                      setVersionId(result.versionId);
                      setLoaded(await getJobDocuments(jobId));
                      notify({ warnings: result.warnings }, "Resume version saved");
                    } catch (cause) {
                      toast({
                        title: "Save failed",
                        description: cause instanceof Error ? cause.message : "Unknown error",
                        variant: "destructive",
                      });
                    }
                  })
                }
              >
                Save resume version
              </Button>
              <Button
                variant="outline"
                loading={isPending}
                onClick={() =>
                  run(async () => {
                    try {
                      const file = await exportResumeDraft(jobId, draft, "pdf");
                      if (file.draft) setDraft(file.draft);
                      downloadBase64(file.filename, file.mimeType, file.base64);
                      notify(file, "PDF downloaded");
                    } catch (cause) {
                      toast({
                        title: "PDF export failed",
                        description: cause instanceof Error ? cause.message : "Unknown error",
                        variant: "destructive",
                      });
                    }
                  })
                }
              >
                Download PDF
              </Button>
              <Button
                variant="outline"
                loading={isPending}
                onClick={() =>
                  run(async () => {
                    try {
                      const file = await exportResumeDraft(jobId, draft, "docx");
                      if (file.draft) setDraft(file.draft);
                      downloadBase64(file.filename, file.mimeType, file.base64);
                      notify(file, "DOCX downloaded");
                    } catch (cause) {
                      toast({
                        title: "DOCX export failed",
                        description: cause instanceof Error ? cause.message : "Unknown error",
                        variant: "destructive",
                      });
                    }
                  })
                }
              >
                Download DOCX
              </Button>
            </div>
          </>
        )}

        {loaded.versions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Saved copies</h3>
            {loaded.versions.map((version) => (
              <div key={version.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{version.name}</span>
                <Badge className="border border-border bg-transparent">{version.versionType}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    run(async () => {
                      try {
                        const file = await exportSavedResume(jobId, version.id, "pdf");
                        downloadBase64(file.filename, file.mimeType, file.base64);
                      } catch (cause) {
                        toast({
                          title: "PDF export failed",
                          description: cause instanceof Error ? cause.message : "Unknown error",
                          variant: "destructive",
                        });
                      }
                    })
                  }
                >
                  PDF
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    run(async () => {
                      try {
                        const file = await exportSavedResume(jobId, version.id, "docx");
                        downloadBase64(file.filename, file.mimeType, file.base64);
                      } catch (cause) {
                        toast({
                          title: "DOCX export failed",
                          description: cause instanceof Error ? cause.message : "Unknown error",
                          variant: "destructive",
                        });
                      }
                    })
                  }
                >
                  DOCX
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Cover letter</h2>
        <p className="text-sm text-muted-foreground">
          About 250–350 words, Canadian English, using only profile facts and this posting.
          {loaded.aiAvailable
            ? ` Generation uses ${modelLabel}.`
            : " Without OPENAI_API_KEY you get a template filled from your profile."}
        </p>
        <Button
          loading={isPending}
          onClick={() =>
            run(async () => {
              try {
                const result = await generateCoverLetter(jobId);
                setLetter(result.coverLetter);
                setLetterBody(result.coverLetter.body);
                setLoaded(await getJobDocuments(jobId));
                toast({ title: "Cover letter ready", description: result.notice });
              } catch (cause) {
                toast({
                  title: "Could not draft cover letter",
                  description: cause instanceof Error ? cause.message : "Unknown error",
                  variant: "destructive",
                });
              }
            })
          }
        >
          Draft cover letter
        </Button>
        {letter && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge className="border border-border bg-transparent">{letter.generationMode}</Badge>
              {letter.model ? <Badge className="border border-border bg-transparent">{letter.model}</Badge> : null}
              <span className="text-xs text-muted-foreground">{countWords(letterBody)} words</span>
            </div>
            {letter.unsupportedClaims.length > 0 && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="space-y-1 p-4 text-sm text-amber-950">
                  {letter.unsupportedClaims.map((claim) => (
                    <p key={claim}>{claim}</p>
                  ))}
                </CardContent>
              </Card>
            )}
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Letter</span>
              <Textarea
                className="min-h-64"
                value={letterBody}
                onChange={(event) => setLetterBody(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                loading={isPending}
                onClick={() =>
                  run(async () => {
                    try {
                      const saved = await saveCoverLetter(jobId, letter.id, letterBody);
                      setLetter(saved);
                      setLetterBody(saved.body);
                      toast({ title: "Cover letter saved" });
                    } catch (cause) {
                      toast({
                        title: "Save failed",
                        description: cause instanceof Error ? cause.message : "Unknown error",
                        variant: "destructive",
                      });
                    }
                  })
                }
              >
                Save letter
              </Button>
              {(["pdf", "docx", "txt"] as const).map((format) => (
                <Button
                  key={format}
                  variant="outline"
                  loading={isPending}
                  onClick={() =>
                    run(async () => {
                      try {
                        const file = await exportCoverLetter(jobId, letterBody, format);
                        downloadBase64(file.filename, file.mimeType, file.base64);
                      } catch (cause) {
                        toast({
                          title: "Export failed",
                          description: cause instanceof Error ? cause.message : "Unknown error",
                          variant: "destructive",
                        });
                      }
                    })
                  }
                >
                  {format.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
