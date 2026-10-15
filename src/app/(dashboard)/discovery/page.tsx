import Link from "next/link";
import { getDiscoveryPageData } from "@/server/actions";
import { CompanyCatalogPanel } from "@/components/discovery/company-catalog-panel";
import { CuratedBoardsPanel } from "@/components/discovery/curated-boards-panel";
import { SuggestedBoardsPanel } from "@/components/discovery/suggested-boards-panel";
import { Button } from "@/components/ui/button";

export default async function DiscoveryPage() {
  // One call: the catalog read must finish before the user transaction opens.
  // Promise.all of those two checkouts deadlocks a small postgres.js pool.
  const { boards, catalog, suggestions, preferences } = await getDiscoveryPageData();

  const followingUrls = new Set(boards.map((b) => b.boardUrl));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Discovery</h1>
          <p className="text-sm text-muted-foreground">
            Browse verified company boards and add them to daily polling.
          </p>
        </div>
        <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
          <Link href="/settings">Manage saved boards</Link>
        </Button>
      </div>

      <CuratedBoardsPanel
        includeCurated={preferences.discoverCuratedBoards}
        excludedBoardUrls={preferences.excludedCuratedBoardUrls}
      />

      <SuggestedBoardsPanel suggestions={suggestions} followingUrls={followingUrls} />

      <CompanyCatalogPanel
        catalog={catalog}
        followingUrls={followingUrls}
        listMaxHeight="max-h-[32rem]"
      />
    </div>
  );
}
