import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

let db: PostgresJsDatabase<typeof schema> | null = null;

export function getDb() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!db) {
    const client = postgres(connectionString, { prepare: false });
    db = drizzle(client, { schema });
  }
  return db;
}
