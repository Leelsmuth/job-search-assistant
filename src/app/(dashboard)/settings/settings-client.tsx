"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addSavedBoard,
  deleteSavedBoard,
  detectBoardProviderAction,
  pollSavedBoardNow,
  signOut,
  updateSavedBoard,
} from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

type BoardProvider = "greenhouse" | "lever" | "ashby";

type Board = {
  id: string;
  companyName: string;
  boardUrl: string;
  provider: string;
  isActive: boolean;
  lastPolledAt: Date | null;
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

export function SettingsClient({ initialBoards }: { initialBoards: Board[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [companyName, setCompanyName] = useState("");
  const [boardUrl, setBoardUrl] = useState("");
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
          if (["greenhouse", "lever", "ashby"].includes(result.provider)) {
            setProvider(result.provider as BoardProvider);
            setDetectHint(result.reason);
          } else {
            setDetectHint("URL does not look like a supported ATS board");
          }
        })
        .catch(() => setDetectHint(null));
    }, 400);

    return () => clearTimeout(timer);
  }, [boardUrl]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved Job Boards (Discovery V1)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add Greenhouse, Lever, or Ashby board URLs. The daily cron polls active boards
            and imports new roles into your feed — this is structured ATS polling, not open-web search.
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
                      <p className="font-medium">{board.companyName}</p>
                      <p className="truncate text-xs text-muted-foreground">{board.boardUrl}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last polled: {formatLastPolled(board.lastPolledAt)}
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
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
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
                      {board.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending || !board.isActive}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            const stats = await pollSavedBoardNow(board.id);
                            router.refresh();
                            toast({
                              title: "Poll complete",
                              description: `${stats.newJobs} new, ${stats.skipped} skipped`,
                            });
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
                      Poll now
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
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
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No saved boards yet. Example:{" "}
              <code className="text-xs">https://boards.greenhouse.io/stripe</code> or{" "}
              <code className="text-xs">https://jobs.lever.co/notion</code>
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
              onChange={(e) => setBoardUrl(e.target.value)}
              placeholder="https://boards.greenhouse.io/company"
            />
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
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
            </select>
          </div>
          <Button
            disabled={isPending || !companyName || !boardUrl}
            onClick={() =>
              startTransition(async () => {
                try {
                  await addSavedBoard({ companyName, boardUrl, provider });
                  setCompanyName("");
                  setBoardUrl("");
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
            Add Board
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
            onClick={() => startTransition(() => signOut())}
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
