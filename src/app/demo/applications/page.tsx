import { parseTrackerQuery } from "@/modules/applications/tracker";
import { DemoTracker } from "./demo-tracker";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DemoApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[];
    status?: string | string[];
    sort?: string | string[];
    dir?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const query = parseTrackerQuery({
    view: firstParam(params.view),
    status: firstParam(params.status),
    sort: firstParam(params.sort),
    dir: firstParam(params.dir),
  });
  return <DemoTracker query={query} />;
}
