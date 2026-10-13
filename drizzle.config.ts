import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { defineConfig } from "drizzle-kit";
import { resolveDirectDatabaseUrl } from "./src/lib/env";

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const directUrl = resolveDirectDatabaseUrl();
const commandNeedsDatabase = process.argv.some((arg) =>
  ["push", "migrate", "studio", "pull", "check"].includes(arg)
);

if (commandNeedsDatabase && !directUrl) {
  throw new Error(
    "drizzle-kit needs a direct Postgres URL. Set POSTGRES_URL_NON_POOLING (Supabase direct connection, port 5432) or DATABASE_URL to a non-pooler URL. The transaction pooler (port 6543) cannot run migrations."
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // generate does not connect. push/migrate/studio require the direct URL above.
    url: directUrl ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
  },
});
