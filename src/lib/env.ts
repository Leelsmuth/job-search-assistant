const VERCEL_ENV_HINT =
  "Set the variable in Vercel → Project Settings → Environment Variables, then redeploy.";

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * Runtime candidates, most preferred first.
 * POSTGRES_URL from the Supabase ↔ Vercel integration is the transaction pooler
 * (port 6543). POSTGRES_URL_NON_POOLING is intentionally absent: a direct
 * connection from serverless exhausts Postgres slots.
 */
const RUNTIME_DATABASE_URL_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL",
  "SUPABASE_DB_URL",
] as const;

/** drizzle-kit and other one-shot admin commands. Never the transaction pooler. */
const DIRECT_DATABASE_URL_KEYS = [
  "POSTGRES_URL_NON_POOLING",
  "DIRECT_URL",
  "DATABASE_URL_UNPOOLED",
] as const;

const PRISMA_ONLY_QUERY_PARAMS = ["pgbouncer", "connection_limit", "pool_timeout"];

/** Supavisor / PgBouncer transaction mode. Session mode and direct connections use 5432. */
export function isTransactionPoolerUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.port === "6543") return true;
    return parsed.searchParams.get("pgbouncer") === "true";
  } catch {
    return /:6543(?:\/|\?|$)/.test(url) || /[?&]pgbouncer=true(?:&|$)/.test(url);
  }
}

/**
 * postgres.js does not understand Prisma's pooler query params. Leaving
 * `pgbouncer=true` on the URL can fail the startup handshake.
 */
export function normalizeRuntimeDatabaseUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  let changed = false;
  for (const key of PRISMA_ONLY_QUERY_PARAMS) {
    if (parsed.searchParams.has(key)) {
      parsed.searchParams.delete(key);
      changed = true;
    }
  }
  return changed ? parsed.toString() : url;
}

function configuredUrls(keys: readonly string[]): string[] {
  const urls: string[] = [];
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) urls.push(value);
  }
  return urls;
}

/**
 * URL for the Next.js runtime. Prefers a transaction-pooler URL (port 6543)
 * even when DATABASE_URL is also set to a direct or session-mode string.
 */
export function resolveDatabaseUrl(): string | undefined {
  const candidates = configuredUrls(RUNTIME_DATABASE_URL_KEYS);
  const pooled = candidates.find(isTransactionPoolerUrl);
  const selected = pooled ?? candidates[0];
  return selected ? normalizeRuntimeDatabaseUrl(selected) : undefined;
}

/**
 * URL for drizzle-kit (generate is offline; push/migrate/studio connect).
 * Transaction-mode pooler sessions cannot hold migration locks.
 */
export function resolveDirectDatabaseUrl(): string | undefined {
  for (const url of configuredUrls(DIRECT_DATABASE_URL_KEYS)) {
    if (!isTransactionPoolerUrl(url)) return url;
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl && !isTransactionPoolerUrl(databaseUrl)) return databaseUrl;
  return undefined;
}

/** Integration may sync NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY instead of ANON_KEY. */
export function resolveSupabaseUrl(): string | undefined {
  return firstEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
}

export function resolveSupabaseAnonKey(): string | undefined {
  return firstEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY"
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(resolveSupabaseUrl() && resolveSupabaseAnonKey());
}

export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = resolveSupabaseUrl();
  const anonKey = resolveSupabaseAnonKey();

  if (!url || !anonKey) {
    throw new Error(
      `Supabase is not configured. Expected NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or Supabase integration equivalents). ${VERCEL_ENV_HINT}`
    );
  }

  return { url, anonKey };
}

/**
 * Read a server env var at call time.
 * Bracket access keeps Next.js from inlining the build-time value.
 */
export function readServerEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export type OpenAiKeyGate = "missing" | "placeholder" | "format" | "wrapped";

export type OpenAiKeyRead =
  | { ok: true; key: string }
  | { ok: false; reason: "no_key"; gate: "missing" }
  | { ok: false; reason: "gate"; gate: Exclude<OpenAiKeyGate, "missing"> };

/** Drop space and quotes Vercel sometimes stores around a pasted key. */
export function unwrapOpenAiKey(raw: string): { key: string; wrapped: boolean } {
  const trimmed = raw.trim();
  const key = trimmed.replace(/^['"“”‘’]+|['"“”‘’]+$/g, "").trim();
  return { key, wrapped: key !== raw };
}

export function describeOpenAiKeyGate(gate: Exclude<OpenAiKeyGate, "missing">): string {
  if (gate === "placeholder") return "OPENAI_API_KEY looks like a placeholder.";
  if (gate === "wrapped") return "OPENAI_API_KEY has surrounding quotes or whitespace.";
  return "OPENAI_API_KEY value doesn't start with sk-.";
}

export function readOpenAiApiKey(): OpenAiKeyRead {
  const raw = process.env.OPENAI_API_KEY;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, reason: "no_key", gate: "missing" };
  }
  const { key, wrapped } = unwrapOpenAiKey(raw);
  if (!key) return { ok: false, reason: "no_key", gate: "missing" };
  if (/your-key|placeholder|changeme/i.test(key) || /^xxx+$/i.test(key)) {
    return { ok: false, reason: "gate", gate: "placeholder" };
  }
  if (!key.startsWith("sk-")) {
    return { ok: false, reason: "gate", gate: wrapped ? "wrapped" : "format" };
  }
  return { ok: true, key };
}

export function getOpenAiApiKey(): string | null {
  const read = readOpenAiApiKey();
  return read.ok ? read.key : null;
}

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

/** Chat model for every OpenAI call. `OPENAI_MODEL` overrides the default. */
export function getOpenAiModel(): string {
  const model = readServerEnv("OPENAI_MODEL");
  if (!model) return DEFAULT_OPENAI_MODEL;
  if (/your-model|placeholder|changeme/i.test(model)) return DEFAULT_OPENAI_MODEL;
  return model;
}

/** True when a real OpenAI key is visible to this server process right now. */
export function isOpenAiConfigured(): boolean {
  return readOpenAiApiKey().ok;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(resolveDatabaseUrl());
}

export function isAppConfigured(): boolean {
  return isSupabaseConfigured() && isDatabaseConfigured();
}

export function getDatabaseUrl(): string {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      `Database URL is not set. Expected POSTGRES_URL (Supabase transaction pooler, port 6543) or DATABASE_URL for local Postgres. ${VERCEL_ENV_HINT}`
    );
  }
  return url;
}

export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!resolveSupabaseUrl()) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  }
  if (!resolveSupabaseAnonKey()) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  }
  if (!resolveDatabaseUrl()) {
    missing.push("POSTGRES_URL (transaction pooler) or DATABASE_URL");
  }
  return missing;
}

export function getSupabaseConfigOrNull(): { url: string; anonKey: string } | null {
  const url = resolveSupabaseUrl();
  const anonKey = resolveSupabaseAnonKey();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function formatMissingConfigMessage(missingVars: string[]): string {
  if (missingVars.length > 0) {
    return `Missing environment variables: ${missingVars.join(", ")}. Add them in Vercel, then redeploy.`;
  }
  return "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy.";
}

export const PROTECTED_PATH_PREFIXES = [
  "/jobs",
  "/profile",
  "/dashboard",
  "/applications",
  "/resumes",
  "/onboarding",
  "/settings",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
