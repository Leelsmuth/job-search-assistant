import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";

let db: PostgresJsDatabase<typeof schema> | null = null;

export function getDb() {
  const connectionString = getDatabaseUrl();
  if (!db) {
    const client = postgres(connectionString, { prepare: false });
    db = drizzle(client, { schema });
  }
  return db;
}
