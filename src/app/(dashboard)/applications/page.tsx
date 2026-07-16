import { getApplications } from "@/server/actions";
import { ApplicationsTable } from "./applications-table";
import { ApplicationsKanban } from "./applications-kanban";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const applications = await getApplications();

  if (params.view === "kanban") {
    return <ApplicationsKanban applications={applications} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">Applications</h1>
        <div className="flex gap-2">
          <Button variant="default" size="sm" className="min-h-10 flex-1 sm:flex-none" asChild>
            <Link href="/applications">Table</Link>
          </Button>
          <Button variant="outline" size="sm" className="min-h-10 flex-1 sm:flex-none" asChild>
            <Link href="/applications?view=kanban">Kanban</Link>
          </Button>
        </div>
      </div>
      <ApplicationsTable applications={applications} />
    </div>
  );
}
