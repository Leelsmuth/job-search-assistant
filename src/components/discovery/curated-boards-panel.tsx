"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  runDiscoveryNow,
  setCuratedBoardExcluded,
  setIncludeCuratedBoards,
} from "@/server/actions/discovery-actions";
import { CURATED_CANADA_BOARDS, canonicalBoardUrl } from "@/modules/discovery/curated-boards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useKeyedPending } from "@/components/layout/action-pending-provider";

export function CuratedBoardsPanel({
  includeCurated,
  excludedBoardUrls,
}: {
  includeCurated: boolean;
  excludedBoardUrls: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isKeyPending } = useKeyedPending();
  const [included, setIncluded] = useState(includeCurated);
  const [excluded, setExcluded] = useState(
    () => new Set(excludedBoardUrls.map((url) => canonicalBoardUrl(url)))
  );

  useEffect(() => {
    setIncluded(includeCurated);
    setExcluded(new Set(excludedBoardUrls.map((url) => canonicalBoardUrl(url))));
  }, [includeCurated, excludedBoardUrls]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Curated boards</CardTitle>
        <p className="text-sm text-muted-foreground">
          Include curated boards is on by default. Daily discovery polls each company once and
          adds matching jobs to your feed. The 08:00 UTC cron finishes in batches before the
          12:00 UTC digest. Exclude a company to skip it. Boards you follow yourself are still
          polled.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={included}
            onChange={() => {
              const next = !included;
              setIncluded(next);
              void run("include-curated", async () => {
                try {
                  await setIncludeCuratedBoards(next);
                  router.refresh();
                } catch (error) {
                  setIncluded(!next);
                  toast({
                    title: "Could not update curated boards",
                    description: error instanceof Error ? error.message : "Unknown error",
                    variant: "destructive",
                  });
                }
              });
            }}
          />
          <span>Include curated boards</span>
        </label>

        <Button
          type="button"
          variant="outline"
          loading={isKeyPending("run-discovery")}
          onClick={() =>
            run("run-discovery", async () => {
              try {
                await runDiscoveryNow();
                toast({
                  title: "Discovery started",
                  description: "Boards are polled in batches. New jobs will show up as each batch finishes.",
                });
              } catch (error) {
                toast({
                  title: "Could not start discovery",
                  description: error instanceof Error ? error.message : "Unknown error",
                  variant: "destructive",
                });
              }
            })
          }
        >
          {isKeyPending("run-discovery") ? "Starting..." : "Run discovery now"}
        </Button>

        <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {CURATED_CANADA_BOARDS.map((board) => {
            const key = canonicalBoardUrl(board.boardUrl);
            const isExcluded = excluded.has(key);
            return (
              <li
                key={board.boardUrl}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{board.companyName}</p>
                    <Badge>{board.provider}</Badge>
                    {isExcluded ? <Badge className="bg-amber-100 text-amber-900">Excluded</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{board.why}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!included}
                  loading={isKeyPending(`exclude-${key}`)}
                  onClick={() =>
                    run(`exclude-${key}`, async () => {
                      const nextExcluded = !isExcluded;
                      try {
                        await setCuratedBoardExcluded(board.boardUrl, nextExcluded);
                        setExcluded((current) => {
                          const copy = new Set(current);
                          if (nextExcluded) copy.add(key);
                          else copy.delete(key);
                          return copy;
                        });
                        router.refresh();
                      } catch (error) {
                        toast({
                          title: "Could not update this board",
                          description: error instanceof Error ? error.message : "Unknown error",
                          variant: "destructive",
                        });
                      }
                    })
                  }
                >
                  {isExcluded ? "Include" : "Exclude"}
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
