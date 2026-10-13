import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl, isTransactionPoolerUrl } from "@/lib/env";
import * as schema from "./schema";

/**
 * One pooled client per server process, reused across warm Vercel invocations.
 * postgres-js defaults (max 10, idle timeout disabled) keep connections open forever
 * and exhaust Supabase when many isolates do that at once.
 *
 * max is 3, not 1. sql.begin reserves a connection for the whole withUserDb
 * transaction. A root-client query started while that reservation is held (the
 * discovery page did this with Promise.all) waits for a free slot. With one
 * slot the transaction and the queued query wait on each other until the
 * function hits the platform timeout. Three slots cover a user transaction
 * plus a catalog read without opening a connection per request.
 *
 * idle_timeout, connect_timeout, and max_lifetime are seconds.
 * statement_timeout and lock_timeout are milliseconds and are also applied
 * inside each user transaction, because Supavisor transaction mode may not
 * keep startup parameters on the backend.
 * prepare must stay false: Supavisor transaction mode rejects prepared statements.
 */
export const DB_STATEMENT_TIMEOUT_MS = 20_000;
export const DB_LOCK_TIMEOUT_MS = 10_000;

export const RUNTIME_POSTGRES_OPTIONS = {
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 5,
  prepare: false,
  connection: {
    statement_timeout: DB_STATEMENT_TIMEOUT_MS,
    lock_timeout: DB_LOCK_TIMEOUT_MS,
  },
} as const;

type PgCache = {
  url: string;
  client: ReturnType<typeof postgres>;
  db: PostgresJsDatabase<typeof schema>;
};

const globalForPg = globalThis as typeof globalThis & {
  __jobSearchPg?: PgCache;
};

let warnedDirectRuntimeUrl = false;

function warnIfDirectRuntimeUrl(connectionString: string) {
  if (warnedDirectRuntimeUrl) return;
  if (process.env.VERCEL !== "1") return;
  if (isTransactionPoolerUrl(connectionString)) return;
  warnedDirectRuntimeUrl = true;
  console.warn(
    "[db] Runtime URL is not the transaction pooler (port 6543). Serverless clients will exhaust Postgres connection slots. Set POSTGRES_URL to the Supabase transaction pooler."
  );
}

export function getDb() {
  const connectionString = getDatabaseUrl();
  warnIfDirectRuntimeUrl(connectionString);

  const cached = globalForPg.__jobSearchPg;
  if (cached?.url === connectionString) return cached.db;

  if (cached) {
    void cached.client.end({ timeout: 0 });
  }

  const client = postgres(connectionString, RUNTIME_POSTGRES_OPTIONS);
  const db = drizzle(client, { schema });
  globalForPg.__jobSearchPg = { url: connectionString, client, db };
  return db;
}

/** Close the shared pool. Scripts call this so the process can exit. */
export async function closeDb(): Promise<void> {
  const cached = globalForPg.__jobSearchPg;
  globalForPg.__jobSearchPg = undefined;
  if (cached) {
    await cached.client.end({ timeout: 5 });
  }
}
