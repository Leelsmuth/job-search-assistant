#!/usr/bin/env tsx
/**
 * Validates local setup before first run.
 * Usage: pnpm setup:check
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env.local");
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "DATABASE_URL",
] as const;

const optional = [
  "OPENAI_API_KEY",
  "CRON_SECRET",
  "SEED_USER_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, "utf-8");
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

async function checkDatabase(url: string): Promise<boolean> {
  try {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { prepare: false, max: 1 });
    await sql`SELECT 1`;
    await sql.end();
    return true;
  } catch (error) {
    const message = (error as Error).message;
    console.error("  Database connection failed:", message);
    if (message.includes("URI malformed")) {
      console.error(
        "  Tip: URL-encode special characters in your password (% → %25, ? → %3F, # → %23, @ → %40)"
      );
    }
    return false;
  }
}

async function main() {
  console.log("Job Search Assistant — setup check\n");

  if (!existsSync(envPath)) {
    console.log("Missing .env.local");
    console.log("  cp .env.example .env.local");
    console.log("  Then fill in Supabase values (see README.md).\n");
    process.exit(1);
  }

  const env = { ...process.env, ...loadEnvFile(envPath) };
  let ok = true;

  console.log("Required variables:");
  for (const key of required) {
    const value = env[key];
    const hasPlaceholder =
      value?.includes("[YOUR-PASSWORD]") ||
      value?.includes("your-") ||
      value?.includes("password@localhost");
    const set = value && !hasPlaceholder;
    console.log(`  ${set ? "✓" : "✗"} ${key}${hasPlaceholder ? " (still has placeholder)" : ""}`);
    if (!set) ok = false;
  }

  console.log("\nOptional variables:");
  for (const key of optional) {
    const value = env[key];
    const set = Boolean(value && !value.includes("your") && !value.startsWith("sk-your"));
    console.log(`  ${set ? "✓" : "○"} ${key}${set ? "" : " (not set)"}`);
  }

  if (env.DATABASE_URL && ok) {
    console.log("\nDatabase connectivity:");
    const dbOk = await checkDatabase(env.DATABASE_URL);
    console.log(`  ${dbOk ? "✓" : "✗"} Postgres reachable`);
    if (!dbOk) ok = false;
  }

  console.log("\nNext steps:");
  if (!ok) {
    console.log("  1. Finish .env.local (Supabase dashboard → Project Settings → API & Database)");
    console.log("  2. Run: pnpm db:push");
    console.log("  3. Run supabase/policies/rls.sql in Supabase SQL editor");
    console.log("  4. Run: drizzle/migrations/0001_indexes.sql");
    console.log("  5. Run: pnpm dev");
    process.exit(1);
  }

  console.log("  1. pnpm db:push          # create tables");
  console.log("  2. Apply RLS + indexes + storage bucket  # see README.md");
  console.log("  3. pnpm dev              # start app");
  console.log("  4. Sign up at /login");
  console.log("  5. SEED_USER_ID=<uuid> pnpm db:seed  # optional seed profile");
  console.log("\nSetup looks good.");
}

main();
