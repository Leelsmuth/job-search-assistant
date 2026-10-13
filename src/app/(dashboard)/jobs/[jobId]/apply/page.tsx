import { notFound } from "next/navigation";
import Link from "next/link";
import { getPreparedApplication, isAssistedApplySchemaError } from "@/server/actions/apply-actions";
import { Card, CardContent } from "@/components/ui/card";
import { PrepareApplication } from "./prepare-application";

export default async function PrepareApplicationPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  try {
    const prepared = await getPreparedApplication(jobId);
    if (!prepared) notFound();
    return <PrepareApplication initial={prepared} />;
  } catch (error) {
    if (!isAssistedApplySchemaError(error)) throw error;
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href={`/jobs/${jobId}`} className="text-sm underline">
          ← Back to job
        </Link>
        <Card>
          <CardContent className="space-y-2 p-6 text-sm">
            <h1 className="text-xl font-bold">Prepare application</h1>
            <p>
              Apply <code>drizzle/migrations/0013_assisted_apply.sql</code> in the Supabase SQL editor,
              then reload this page. Do not run that migration from CI or against a database you have
              not reviewed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
}
