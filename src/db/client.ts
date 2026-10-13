import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl, isTransactionPoolerUrl } from "@/lib/env";
import * as schema from "./schema";

/**
 * One pooled client per server process, reused across warm Vercel invocations.
 * postgres-js defaults (max 10, idle timeout disabled) keep connections open forever
 * and exhaust Supabase when many isolates do that at once.
 *
 * idle_timeout and max_lifetime are seconds.
 * prepare must stay false: Supavisor transaction mode rejects prepared statements.
 */
export const RUNTIME_POSTGRES_OPTIONS = {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 5,
  prepare: false,
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
