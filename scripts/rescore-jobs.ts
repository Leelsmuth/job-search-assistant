#!/usr/bin/env tsx
/**
 * Rescore every job for one user and clean stored skills.
 * Usage: pnpm rescore:jobs <user-uuid>
 * Requires the 0018 migration to be applied first.
 */
import { closeDb } from "@/db/client";
import { withUserDb } from "@/db/user-context";
import { rescoreUserJobs } from "@/modules/matching/rescore-jobs";

const userId = process.argv[2] ?? process.env.SEED_USER_ID;

async function main() {
  if (!userId) {
    console.error("Pass a user id: pnpm rescore:jobs <user-uuid>");
    process.exit(1);
  }
  const result = await withUserDb(userId, (db) => rescoreUserJobs(db, userId));
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
