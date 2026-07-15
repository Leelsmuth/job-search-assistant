import { isSupabaseConfigured } from "@/lib/supabase/config";

const VERCEL_ENV_HINT =
  "Set the variable in Vercel → Project Settings → Environment Variables, then redeploy.";

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function isAppConfigured(): boolean {
  return isSupabaseConfigured() && isDatabaseConfigured();
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      `DATABASE_URL is not set. Add your Supabase Session pooler connection string. ${VERCEL_ENV_HINT}`
    );
  }
  return url;
}

export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (!process.env.DATABASE_URL?.trim()) {
    missing.push("DATABASE_URL");
  }
  return missing;
}
