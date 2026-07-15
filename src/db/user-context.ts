import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Db } from "@/server/actions/helpers";

export async function withUserDb<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`
    );
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    return fn(tx as Db);
  });
}
