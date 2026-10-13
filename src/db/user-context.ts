import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Db } from "@/server/actions/helpers";
import { incrementDbQueryCount } from "@/lib/performance/request-context";
import { measureOperation } from "@/lib/performance/measure-operation";

export async function withUserDb<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return measureOperation(
    "db.transaction",
    async () => {
      incrementDbQueryCount();
      const db = getDb();
      // SET LOCAL is transaction-scoped, which is required for Supavisor
      // transaction pooling (port 6543). A session-level SET ROLE would not
      // stick to the next statement, and would leak across clients in session mode.
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`
        );
        await tx.execute(sql`SET LOCAL ROLE authenticated`);
        return fn(tx as Db);
      });
    },
    { source: "database" }
  );
}
