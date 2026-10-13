import { describe, it, expect, afterEach } from "vitest";
import {
  resolveDatabaseUrl,
  resolveDirectDatabaseUrl,
  resolveSupabaseAnonKey,
  resolveSupabaseUrl,
  isAppConfigured,
  getSupabaseConfigOrNull,
  formatMissingConfigMessage,
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

  it("prefers a transaction pooler URL over a direct DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgresql://postgres:pw@db.example.supabase.co:5432/postgres";
    process.env.POSTGRES_URL =
      "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
    expect(resolveDatabaseUrl()).toBe(process.env.POSTGRES_URL);
  });

  it("prefers port 6543 when POSTGRES_URL is session mode", () => {
    process.env.POSTGRES_URL =
      "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
    process.env.POSTGRES_PRISMA_URL =
      "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1";
    expect(resolveDatabaseUrl()).toBe(
      "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    );
  });

  it("does not use POSTGRES_URL_NON_POOLING for runtime", () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    delete process.env.SUPABASE_DB_URL;
    process.env.POSTGRES_URL_NON_POOLING =
      "postgresql://postgres:pw@db.example.supabase.co:5432/postgres";
    expect(resolveDatabaseUrl()).toBeUndefined();
    expect(resolveDirectDatabaseUrl()).toBe(process.env.POSTGRES_URL_NON_POOLING);
  });

  it("uses a direct DATABASE_URL for drizzle when no non-pooling var is set", () => {
    delete process.env.POSTGRES_URL_NON_POOLING;
    delete process.env.DIRECT_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.POSTGRES_URL = "postgresql://pooler.example:6543/postgres";
    process.env.DATABASE_URL = "postgresql://localhost:5432/postgres";
    expect(resolveDirectDatabaseUrl()).toBe("postgresql://localhost:5432/postgres");
  });

  it("does not give drizzle-kit a transaction pooler URL", () => {
    delete process.env.POSTGRES_URL_NON_POOLING;
    delete process.env.DIRECT_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL = "postgresql://pooler.example:6543/postgres";
    expect(resolveDirectDatabaseUrl()).toBeUndefined();
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

  it("getSupabaseConfigOrNull returns config when Supabase vars are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
    expect(getSupabaseConfigOrNull()).toEqual({
      url: "https://abc.supabase.co",
      anonKey: "anon-test",
    });
  });

  it("formatMissingConfigMessage handles empty missing list", () => {
    expect(formatMissingConfigMessage([])).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
});
