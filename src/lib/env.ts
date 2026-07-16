const VERCEL_ENV_HINT =
  "Set the variable in Vercel → Project Settings → Environment Variables, then redeploy.";

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Supabase ↔ Vercel integration uses POSTGRES_URL, not DATABASE_URL. */
export function resolveDatabaseUrl(): string | undefined {
  return firstEnv(
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "SUPABASE_DB_URL"
  );
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
      `Database URL is not set. Expected DATABASE_URL or POSTGRES_URL from Supabase integration. ${VERCEL_ENV_HINT}`
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
    missing.push("DATABASE_URL (or POSTGRES_URL)");
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
