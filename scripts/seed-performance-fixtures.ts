/**
 * Seeds synthetic jobs for local performance profiling.
 * Does not call external ATS APIs.
 *
 * Usage: pnpm seed:performance-fixtures
 * Env: PERF_SEED_USER_ID (required), PERF_SEED_JOB_COUNT (default 200)
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { candidateProfiles, companies, jobSources, jobs } from "@/db/schema";
import { hashJobDescription } from "@/modules/ingestion/description-hash";

const userId = process.env.PERF_SEED_USER_ID;
const jobCount = Number(process.env.PERF_SEED_JOB_COUNT ?? 200);

async function main() {
  if (!userId) {
    console.error("Set PERF_SEED_USER_ID to a valid Supabase user UUID.");
    process.exit(1);
  }

  const db = getDb();

  let profile = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, userId),
  });
  if (!profile) {
    [profile] = await db.insert(candidateProfiles).values({ userId }).returning();
  }

  const [company] = await db
    .insert(companies)
    .values({ name: "Perf Seed Co", atsProvider: "greenhouse" })
    .returning()
    .catch(async () => {
      const existing = await db.query.companies.findFirst({
        where: eq(companies.name, "Perf Seed Co"),
      });
      if (!existing) throw new Error("Could not create seed company");
      return [existing];
    });

  const [source] = await db
    .insert(jobSources)
    .values({ provider: "greenhouse", sourceUrl: "https://example.com/perf-seed" })
    .returning();

  const batchSize = 50;
  let inserted = 0;

  while (inserted < jobCount) {
    const chunk = Array.from(
      { length: Math.min(batchSize, jobCount - inserted) },
      (_, i) => {
        const n = inserted + i;
        const description = `Performance seed job ${n}. Build reliable systems.`;
        return {
          userId,
          companyId: company.id,
          sourceId: source.id,
          title: `Software Engineer ${n}`,
          location: n % 2 === 0 ? "Remote" : "Toronto, ON",
          workplaceType: n % 2 === 0 ? "remote" : "hybrid",
          jobUrl: `https://example.com/perf/${n}`,
          sourceJobId: `perf-${n}`,
          description,
          descriptionHash: hashJobDescription(description),
          matchPipelineStatus: "matched" as const,
          dateDiscovered: new Date(Date.now() - n * 60_000),
        };
      }
    );

    await db.insert(jobs).values(chunk);
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${jobCount} jobs`);
  }

  console.log(`Done. Profile ${profile.id}, company ${company.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
