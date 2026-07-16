import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/config";

export type SupabaseClientConfig = { url: string; anonKey: string };

export function createClient(config?: SupabaseClientConfig) {
  const { url, anonKey } = config ?? getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
