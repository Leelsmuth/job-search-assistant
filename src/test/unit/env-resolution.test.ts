import { describe, it, expect, afterEach } from "vitest";
import {
  resolveDatabaseUrl,
  resolveDirectDatabaseUrl,
  resolveSupabaseAnonKey,
  resolveSupabaseUrl,
  isAppConfigured,
  getSupabaseConfigOrNull,
  formatMissingConfigMessage,
  getOpenAiModel,
  isOpenAiConfigured,
  readOpenAiApiKey,
  DEFAULT_OPENAI_MODEL,
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

  it("defaults the OpenAI model and honors OPENAI_MODEL", () => {
    delete process.env.OPENAI_MODEL;
    expect(getOpenAiModel()).toBe(DEFAULT_OPENAI_MODEL);
    process.env.OPENAI_MODEL = "gpt-4.1-mini";
    expect(getOpenAiModel()).toBe("gpt-4.1-mini");
    process.env.OPENAI_MODEL = "placeholder";
    expect(getOpenAiModel()).toBe(DEFAULT_OPENAI_MODEL);
  });

  it("reads OPENAI_API_KEY at call time and does not reject keys that contain xxx", () => {
    delete process.env.OPENAI_API_KEY;
    expect(isOpenAiConfigured()).toBe(false);
    process.env.OPENAI_API_KEY = "sk-live-key-with-xxx-inside";
    expect(isOpenAiConfigured()).toBe(true);
    process.env.OPENAI_API_KEY = "xxx";
    expect(isOpenAiConfigured()).toBe(false);
    process.env.OPENAI_API_KEY = "placeholder-key";
    expect(isOpenAiConfigured()).toBe(false);
  });

  it("trims quotes and whitespace around an OpenAI key and names the gate", () => {
    process.env.OPENAI_API_KEY = '  "sk-quoted-key"  ';
    expect(readOpenAiApiKey()).toEqual({ ok: true, key: "sk-quoted-key" });

    process.env.OPENAI_API_KEY = "not-a-real-key";
    expect(readOpenAiApiKey()).toMatchObject({ ok: false, gate: "format" });

    process.env.OPENAI_API_KEY = '"not-a-real-key"';
    expect(readOpenAiApiKey()).toMatchObject({ ok: false, gate: "wrapped" });

    process.env.OPENAI_API_KEY = "  your-key-here  ";
    expect(readOpenAiApiKey()).toMatchObject({ ok: false, gate: "placeholder" });
  });
});
