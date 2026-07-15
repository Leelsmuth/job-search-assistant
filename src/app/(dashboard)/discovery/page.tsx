import Link from "next/link";
import { getSavedBoards, getCompanySourceCatalog } from "@/server/actions";
import { CompanyCatalogPanel } from "@/components/discovery/company-catalog-panel";
import { Button } from "@/components/ui/button";

export default async function DiscoveryPage() {
  const [boards, catalog] = await Promise.all([
    getSavedBoards(),
    getCompanySourceCatalog(),
  ]);

  const followingUrls = new Set(boards.map((b) => b.boardUrl));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Discovery</h1>
          <p className="text-sm text-muted-foreground">
            Browse verified company boards and add them to daily polling.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings">Manage saved boards</Link>
        </Button>
      </div>

      <CompanyCatalogPanel
        catalog={catalog}
        followingUrls={followingUrls}
        listMaxHeight="max-h-[32rem]"
      />
    </div>
  );
}
