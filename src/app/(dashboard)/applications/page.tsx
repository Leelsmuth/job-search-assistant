import { getApplications } from "@/server/actions";
import { ApplicationsTable } from "./applications-table";
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
    return <KanbanView applications={applications} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Applications</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
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

function KanbanView({
  applications,
}: {
  applications: Awaited<ReturnType<typeof getApplications>>;
}) {
  const columns = [
    "saved",
    "preparing",
    "ready_to_apply",
    "applied",
    "recruiter_screen",
    "technical_interview",
    "final_interview",
    "offer",
  ] as const;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Applications — Kanban</h1>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((status) => {
          const items = applications.filter((a) => a.status === status);
          return (
            <div key={status} className="min-w-[200px] rounded-lg border border-border bg-muted/30 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {status.replace(/_/g, " ")} ({items.length})
              </h3>
              <div className="space-y-2">
                {items.map((app) => (
                  <Link
                    key={app.id}
                    href={`/jobs/${app.jobId}`}
                    className="block rounded-md border border-border bg-card p-2 text-sm hover:bg-accent/50"
                  >
                    <p className="font-medium">{app.job?.title}</p>
                    <p className="text-xs text-muted-foreground">{app.job?.company?.name}</p>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
