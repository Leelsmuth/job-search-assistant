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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Applications</h1>
        <div className="flex gap-2">
          <Button variant="default" size="sm" asChild>
            <Link href="/applications">Table</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/applications?view=kanban">Kanban</Link>
          </Button>
        </div>
      </div>
      <ApplicationsTable applications={applications} />
    </div>
  );
}
