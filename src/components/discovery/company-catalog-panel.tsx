"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSavedBoardFromCatalog } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

export type CatalogEntry = {
  id: string;
  companyName: string;
  atsProvider: "greenhouse" | "lever" | "ashby";
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

export function CompanyCatalogPanel({
  catalog,
  followingUrls,
  listMaxHeight = "max-h-80",
}: {
  catalog: CatalogEntry[];
  followingUrls: Set<string>;
  listMaxHeight?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogProvider, setCatalogProvider] = useState("");
  const [catalogCountry, setCatalogCountry] = useState("");
  const [catalogIndustry, setCatalogIndustry] = useState("");
  const [catalogSignal, setCatalogSignal] = useState("");

  const filteredCatalog = useMemo(() => {
    return catalog.filter((entry) => {
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
  }, [catalog, catalogProvider, catalogCountry, catalogIndustry, catalogSignal, catalogSearch]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Browse Company Catalog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {catalog.length} verified active ATS job boards. Filter by observed job signals (Canada,
          remote Canada, frontend) — not permanent company tags.
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
        <ul className={`${listMaxHeight} space-y-2 overflow-y-auto`}>
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
  );
}
