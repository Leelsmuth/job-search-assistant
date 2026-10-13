import { sql } from "drizzle-orm";
import { DB_LOCK_TIMEOUT_MS, DB_STATEMENT_TIMEOUT_MS, getDb } from "@/db/client";
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
      // Timeouts are set before the role change so the owner can set them, and
      // so a stuck statement fails instead of holding the pool slot until the
      // platform kills the function.
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('statement_timeout', ${String(DB_STATEMENT_TIMEOUT_MS)}, true), set_config('lock_timeout', ${String(DB_LOCK_TIMEOUT_MS)}, true)`
        );
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
