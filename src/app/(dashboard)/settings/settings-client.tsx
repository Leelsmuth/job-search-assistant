"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addSavedBoard,
  addSavedBoardFromCatalog,
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
import { Badge } from "@/components/ui/badge";
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

type CatalogEntry = {
  id: string;
  companyName: string;
  atsProvider: BoardProvider;
  boardUrl: string;
  headquartersCountry?: string;
  industries: string[];
  verifiedAt?: string;
  lastJobCount?: number;
  observedSignals?: {
    hasCanadaJobs?: boolean;
    hasRemoteCanadaJobs?: boolean;
    hasFrontendJobs?: boolean;
    hasReactJobs?: boolean;
  };
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
  initialCatalog,
}: {
  initialBoards: Board[];
  initialCatalog: CatalogEntry[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [companyName, setCompanyName] = useState("");
  const [boardUrl, setBoardUrl] = useState("");
  const [provider, setProvider] = useState<BoardProvider>("greenhouse");
  const [detectHint, setDetectHint] = useState<string | null>(null);

  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogProvider, setCatalogProvider] = useState("");
  const [catalogCountry, setCatalogCountry] = useState("");
  const [catalogIndustry, setCatalogIndustry] = useState("");
  const [catalogSignal, setCatalogSignal] = useState("");

  const followingUrls = useMemo(
    () => new Set(initialBoards.map((b) => b.boardUrl)),
    [initialBoards]
  );

  const filteredCatalog = useMemo(() => {
    return initialCatalog.filter((entry) => {
      if (catalogProvider && entry.atsProvider !== catalogProvider) return false;
      if (catalogCountry && entry.headquartersCountry !== catalogCountry) return false;
      if (catalogIndustry && !entry.industries.includes(catalogIndustry)) return false;
      if (catalogSignal) {
        const signals = entry.observedSignals;
        if (!signals || !signals[catalogSignal as keyof typeof signals]) return false;
      }
      if (catalogSearch) {
        const q = catalogSearch.toLowerCase();
        if (!entry.companyName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [initialCatalog, catalogProvider, catalogCountry, catalogIndustry, catalogSignal, catalogSearch]);

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
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Browse Company Catalog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {initialCatalog.length} verified active ATS job boards. Filter by observed job signals
            (Canada, remote Canada, frontend) — not permanent company tags.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Search</Label>
              <Input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Company name"
              />
            </div>
            <div>
              <Label className="text-xs">Provider</Label>
              <select
                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                value={catalogProvider}
                onChange={(e) => setCatalogProvider(e.target.value)}
              >
                <option value="">All</option>
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
                <option value="ashby">Ashby</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Country</Label>
              <select
                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                value={catalogCountry}
                onChange={(e) => setCatalogCountry(e.target.value)}
              >
                <option value="">All</option>
                <option value="CA">Canada HQ</option>
                <option value="US">US HQ</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Industry</Label>
              <select
                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                value={catalogIndustry}
                onChange={(e) => setCatalogIndustry(e.target.value)}
              >
                <option value="">All</option>
                <option value="fintech">Fintech</option>
                <option value="ai">AI</option>
                <option value="saas">SaaS</option>
                <option value="devtools">DevTools</option>
                <option value="security">Security</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Observed signal</Label>
              <select
                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                value={catalogSignal}
                onChange={(e) => setCatalogSignal(e.target.value)}
              >
                <option value="">All</option>
                <option value="hasCanadaJobs">Has Canada jobs</option>
                <option value="hasRemoteCanadaJobs">Has remote Canada jobs</option>
                <option value="hasFrontendJobs">Has frontend jobs</option>
                <option value="hasReactJobs">Has React jobs</option>
              </select>
            </div>
          </div>
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {filteredCatalog.length === 0 ? (
              <li className="text-sm text-muted-foreground">No companies match filters.</li>
            ) : (
              filteredCatalog.map((entry) => {
                const following = followingUrls.has(entry.boardUrl);
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{entry.companyName}</p>
                        <Badge className="text-xs uppercase">{entry.atsProvider}</Badge>
                        {entry.headquartersCountry ? (
                          <Badge className="text-xs">{entry.headquartersCountry}</Badge>
                        ) : null}
                        {entry.observedSignals?.hasRemoteCanadaJobs ? (
                          <Badge className="text-xs">Remote CA</Badge>
                        ) : null}
                        {entry.observedSignals?.hasFrontendJobs ? (
                          <Badge className="text-xs">Frontend</Badge>
                        ) : null}
                      </div>
                      {entry.industries.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.industries.slice(0, 3).join(" · ")}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.lastJobCount ?? "?"} jobs
                        {entry.verifiedAt
                          ? ` · verified ${new Date(entry.verifiedAt).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={following ? "outline" : "default"}
                      disabled={isPending || following}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            const result = await addSavedBoardFromCatalog(entry.id);
                            router.refresh();
                            toast({
                              title: result.alreadyFollowing ? "Already following" : "Board added",
                              description: entry.companyName,
                            });
                          } catch (e) {
                            toast({
                              title: "Failed to add board",
                              description: e instanceof Error ? e.message : "Unknown error",
                              variant: "destructive",
                            });
                          }
                        })
                      }
                    >
                      {following ? "Following" : "Add"}
                    </Button>
                  </li>
                );
              })
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved Job Boards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Boards you follow are polled daily (or use Poll now). Structured ATS polling only.
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
                              description: `${stats.newJobs} new, ${stats.skipped} skipped, ${stats.filtered} filtered`,
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
              No saved boards yet. Add from the catalog above or paste a board URL below.
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
