import { describe, it, expect, afterEach } from "vitest";
import {
  resolveDatabaseUrl,
  resolveSupabaseAnonKey,
  resolveSupabaseUrl,
  isAppConfigured,
} from "@/lib/env";

describe("env resolution", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("resolves POSTGRES_URL when DATABASE_URL is absent", () => {
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = "postgresql://pooler.example/db";
    expect(resolveDatabaseUrl()).toBe("postgresql://pooler.example/db");
  });

  it("resolves publishable key alias for anon key", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk-test";
    expect(resolveSupabaseAnonKey()).toBe("pk-test");
  });

  it("isAppConfigured when integration-style vars are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk-test";
    process.env.POSTGRES_URL = "postgresql://pooler.example/db";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.DATABASE_URL;
    expect(isAppConfigured()).toBe(true);
    expect(resolveSupabaseUrl()).toBe("https://abc.supabase.co");
  });
});
