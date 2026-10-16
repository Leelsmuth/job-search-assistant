"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addSavedBoard,
  deleteSavedBoard,
  detectBoardProviderAction,
  pollSavedBoardNow,
  getBoardPollRunStatus,
  rescoreAllJobsAction,
  saveCandidateSkills,
  signOut,
  updateSavedBoard,
} from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useKeyedPending } from "@/components/layout/action-pending-provider";
import { CuratedBoardsPanel } from "@/components/discovery/curated-boards-panel";
import { DiscoverySourcesPanel } from "@/components/discovery/discovery-sources-panel";
import {
  PASTEABLE_BOARD_PROVIDERS,
  SOURCE_LABELS,
  isPasteableBoardProvider,
  type PasteableBoardProvider,
} from "@/modules/discovery/source-catalog";
import { SkillsChipEditor } from "@/components/profile/skills-chip-editor";
import { SearchPreferencesForm } from "./search-preferences-form";
import { ApplicationProfileForm } from "./application-profile-form";
import { DigestSettingsForm } from "./digest-settings-form";
import { AlertSettingsForm } from "./alert-settings-form";
import { BrowserExtensionPanel } from "./browser-extension-panel";
import type { ExtensionTokenSummary } from "@/modules/extension/token-summary";
import type { SearchPreferences } from "@/modules/matching/search-preferences";
import type { ApplicationProfile } from "@/modules/apply/types";
import type { OpenAiHealthReport } from "@/modules/ai/openai-health";

type BoardProvider = PasteableBoardProvider;

type Board = {
  id: string;
  companyName: string;
  boardUrl: string;
  provider: string;
  isActive: boolean;
  lastPolledAt: Date | null;
  lastPollNewJobs: number | null;
  lastPollSkipped: number | null;
  lastPollFiltered: number | null;
  discoveredJobCount: number;
  considerRemoving: boolean;
};

function formatLastPolled(lastPolledAt: Date | null) {
  if (!lastPolledAt) return "Never polled";
  const diffMs = Date.now() - new Date(lastPolledAt).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SettingsClient({
  initialBoards,
  preferences,
  skills,
  applicationProfile,
  applicationProfileReady,
  digestEmailsEnabled,
  digestSchemaReady,
  digestLastSentAt,
  alertsEnabled,
  alertsDailyCap,
  alertsSchemaReady,
  openAi,
  extensionTokens,
  extensionSchemaReady,
}: {
  initialBoards: Board[];
  preferences: SearchPreferences;
  skills: string[];
  applicationProfile: ApplicationProfile;
  applicationProfileReady: boolean;
  digestEmailsEnabled: boolean;
  digestSchemaReady: boolean;
  digestLastSentAt: string | null;
  alertsEnabled: boolean;
  alertsDailyCap: number;
  alertsSchemaReady: boolean;
  openAi: OpenAiHealthReport;
  extensionTokens: ExtensionTokenSummary[];
  extensionSchemaReady: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();
  const [skillNames, setSkillNames] = useState(skills);
  const [companyName, setCompanyName] = useState("");
  const [boardUrl, setBoardUrl] = useState("");
  const [boardError, setBoardError] = useState<string | null>(null);
  const [provider, setProvider] = useState<BoardProvider>("greenhouse");
  const [detectHint, setDetectHint] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = boardUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setDetectHint(null);
      return;
    }

    const timer = setTimeout(() => {
      detectBoardProviderAction(trimmed)
        .then((result) => {
          if (isPasteableBoardProvider(result.provider)) {
            setProvider(result.provider);
            setDetectHint(result.reason);
          } else {
            setDetectHint("URL does not look like a supported careers board");
          }
        })
        .catch(() => setDetectHint(null));
    }, 400);

    return () => clearTimeout(timer);
  }, [boardUrl]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">Settings</h1>
        <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
          <Link href="/discovery">Browse company catalog</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">OpenAI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge
              className={
                openAi.ok
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-transparent bg-secondary text-secondary-foreground"
              }
            >
              {openAi.ok ? "Key works" : openAi.configured ? "Key rejected" : "Key missing"}
            </Badge>
          </div>
          <p>{openAi.detail}</p>
          <p className="text-xs text-muted-foreground">
            Checked on the server when this page loads. The key itself is never shown.
          </p>
        </CardContent>
      </Card>

      <SearchPreferencesForm initial={preferences} />

      <DiscoverySourcesPanel enabled={preferences.enabledDiscoverySources} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SkillsChipEditor skills={skillNames} onChange={setSkillNames} id="settings-skills" />
          <Button
            type="button"
            variant="outline"
            loading={isKeyPending("save-skills")}
            onClick={() =>
              run("save-skills", async () => {
                try {
                  const saved = await saveCandidateSkills(skillNames);
                  setSkillNames(saved);
                  toast({ title: "Skills saved" });
                  router.refresh();
                } catch (error) {
                  toast({
                    title: "Could not save skills",
                    description: error instanceof Error ? error.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              })
            }
          >
            Save skills
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rescore jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Scores every saved job again from your skills, titles, and minimum salary. Low-fit and
            ineligible roles stay stored.
          </p>
          <Button
            type="button"
            loading={isKeyPending("rescore")}
            onClick={() =>
              run("rescore", async () => {
                try {
                  const result = await rescoreAllJobsAction();
                  toast({
                    title: "Jobs rescored",
                    description: `${result.jobsScored} jobs scored. Skills ${result.skillsBefore} → ${result.skillsAfter}.`,
                  });
                  router.refresh();
                } catch (error) {
                  toast({
                    title: "Could not rescore",
                    description: error instanceof Error ? error.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              })
            }
          >
            Rescore all
          </Button>
        </CardContent>
      </Card>

      <CuratedBoardsPanel
        includeCurated={preferences.discoverCuratedBoards}
        excludedBoardUrls={preferences.excludedCuratedBoardUrls}
      />

      <DigestSettingsForm
        emailsEnabled={digestEmailsEnabled}
        schemaReady={digestSchemaReady}
        lastSentAt={digestLastSentAt}
      />

      <AlertSettingsForm
        enabled={alertsEnabled}
        dailyCap={alertsDailyCap}
        schemaReady={alertsSchemaReady}
      />

      <ApplicationProfileForm initial={applicationProfile} schemaReady={applicationProfileReady} />

      <BrowserExtensionPanel schemaReady={extensionSchemaReady} tokens={extensionTokens} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved Job Boards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Boards you follow are polled daily (or use Poll now). Add more from{" "}
            <Link href="/discovery" className="text-primary underline">
              Discovery
            </Link>
            .
          </p>
          {initialBoards.length > 0 ? (
            <ul className="space-y-2">
              {initialBoards.map((board) => (
                <li
                  key={board.id}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{board.companyName}</p>
                        {board.considerRemoving ? (
                          <Badge className="bg-amber-100 text-amber-900">
                            Consider removing
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{board.boardUrl}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last polled: {formatLastPolled(board.lastPolledAt)}
                        {board.lastPolledAt
                          ? ` · ${board.lastPollNewJobs ?? 0} new, ${board.lastPollSkipped ?? 0} skipped, ${board.lastPollFiltered ?? 0} filtered`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {board.discoveredJobCount} jobs in feed from this board
                      </p>
                    </div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {board.provider}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      loading={isKeyPending(`toggle-${board.id}`)}
                      onClick={() =>
                        run(`toggle-${board.id}`, async () => {
                          try {
                            await updateSavedBoard(board.id, { isActive: !board.isActive });
                            router.refresh();
                          } catch (e) {
                            toast({
                              title: "Failed to update board",
                              description: e instanceof Error ? e.message : "Unknown error",
                              variant: "destructive",
                            });
                          }
                        })
                      }
                    >
                      {isKeyPending(`toggle-${board.id}`)
                        ? "Updating..."
                        : board.isActive
                          ? "Disable"
                          : "Enable"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      loading={isKeyPending(`poll-${board.id}`)}
                      disabled={!board.isActive}
                      onClick={() =>
                        run(`poll-${board.id}`, async () => {
                          try {
                            await pollSavedBoardNow(board.id);
                            toast({
                              title: "Poll started",
                              description: "Fetching jobs in the background. Refresh shortly.",
                            });

                            for (let attempt = 0; attempt < 30; attempt++) {
                              await new Promise((resolve) => setTimeout(resolve, 2000));
                              const status = await getBoardPollRunStatus(board.id);
                              if (!status) continue;
                              if (status.status === "completed") {
                                const stats = status.stats ?? {};
                                router.refresh();
                                toast({
                                  title: "Poll complete",
                                  description: `${stats.newJobs ?? 0} new, ${stats.skipped ?? 0} skipped, ${stats.filtered ?? 0} filtered`,
                                });
                                return;
                              }
                              if (status.status === "failed") {
                                throw new Error(status.errorText ?? "Poll failed");
                              }
                            }
                          } catch (e) {
                            toast({
                              title: "Poll failed",
                              description: e instanceof Error ? e.message : "Unknown error",
                              variant: "destructive",
                            });
                          }
                        })
                      }
                    >
                      {isKeyPending(`poll-${board.id}`) ? "Polling..." : "Poll now"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      loading={isKeyPending(`delete-${board.id}`)}
                      onClick={() =>
                        run(`delete-${board.id}`, async () => {
                          try {
                            await deleteSavedBoard(board.id);
                            router.refresh();
                            toast({ title: "Board removed" });
                          } catch (e) {
                            toast({
                              title: "Failed to delete board",
                              description: e instanceof Error ? e.message : "Unknown error",
                              variant: "destructive",
                            });
                          }
                        })
                      }
                    >
                      {isKeyPending(`delete-${board.id}`) ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No saved boards yet.{" "}
              <Link href="/discovery" className="text-primary underline">
                Browse the catalog
              </Link>{" "}
              or paste a board URL below.
            </p>
          )}
          <div>
            <Label>Company Name</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <Label>Board URL</Label>
            <Input
              value={boardUrl}
              onChange={(e) => {
                setBoardUrl(e.target.value);
                setBoardError(null);
              }}
              placeholder="https://boards.greenhouse.io/company"
              aria-invalid={boardError ? true : undefined}
              aria-describedby={boardError ? "board-url-error" : undefined}
            />
            {boardError ? (
              <p id="board-url-error" role="alert" className="mt-1 text-sm text-destructive">
                {boardError}
              </p>
            ) : null}
            {detectHint && (
              <p className="mt-1 text-xs text-muted-foreground">{detectHint}</p>
            )}
          </div>
          <div>
            <Label>Provider</Label>
            <select
              className="w-full rounded-md border border-input px-3 py-2 text-sm"
              value={provider}
              onChange={(e) => setProvider(e.target.value as BoardProvider)}
            >
              {PASTEABLE_BOARD_PROVIDERS.map((id) => (
                <option key={id} value={id}>
                  {SOURCE_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
          <Button
            loading={isKeyPending("add-board")}
            disabled={!companyName || !boardUrl}
            onClick={() =>
              run("add-board", async () => {
                try {
                  const result = await addSavedBoard({ companyName, boardUrl, provider });
                  if (!result.ok) {
                    setBoardError(result.error);
                    return;
                  }
                  setCompanyName("");
                  setBoardUrl("");
                  setBoardError(null);
                  setDetectHint(null);
                  router.refresh();
                  toast({ title: "Board saved" });
                } catch (e) {
                  toast({
                    title: "Failed to save board",
                    description: e instanceof Error ? e.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              })
            }
          >
            {isKeyPending("add-board") ? "Adding..." : "Add Board"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            loading={isKeyPending("sign-out")}
            onClick={() => run("sign-out", async () => signOut())}
          >
            {isKeyPending("sign-out") ? "Signing out..." : "Sign Out"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
