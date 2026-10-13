import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUNTIME_POSTGRES_OPTIONS } from "@/db/client";

vi.mock("postgres", () => ({
  default: vi.fn(() => ({
    options: { parsers: {}, serializers: {} },
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("runtime postgres pool", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as { __jobSearchPg?: unknown }).__jobSearchPg;
    process.env = { ...original };
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    delete process.env.SUPABASE_DB_URL;
    delete process.env.VERCEL;
    process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/postgres";
  });

  afterEach(() => {
    delete (globalThis as { __jobSearchPg?: unknown }).__jobSearchPg;
    process.env = { ...original };
  });

  it("keeps a small pool, releases idle connections, and disables prepared statements", () => {
    expect(RUNTIME_POSTGRES_OPTIONS.max).toBe(3);
    expect(RUNTIME_POSTGRES_OPTIONS.idle_timeout).toBeGreaterThan(0);
    expect(RUNTIME_POSTGRES_OPTIONS.connect_timeout).toBeGreaterThan(0);
    expect(RUNTIME_POSTGRES_OPTIONS.connect_timeout).toBeLessThanOrEqual(10);
    expect(RUNTIME_POSTGRES_OPTIONS.connection.statement_timeout).toBe(20_000);
    expect(RUNTIME_POSTGRES_OPTIONS.connection.lock_timeout).toBe(10_000);
    expect(RUNTIME_POSTGRES_OPTIONS.prepare).toBe(false);
  });

  it("reuses one client across calls and ignores the non-pooling URL", async () => {
    process.env.POSTGRES_URL = "postgresql://pooler.example:6543/postgres";
    process.env.POSTGRES_URL_NON_POOLING = "postgresql://db.example:5432/postgres";

    const postgres = (await import("postgres")).default as unknown as ReturnType<typeof vi.fn>;
    const { getDb } = await import("@/db/client");

    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(postgres).toHaveBeenCalledTimes(1);
    expect(postgres).toHaveBeenCalledWith(
      "postgresql://pooler.example:6543/postgres",
      expect.objectContaining({
        max: RUNTIME_POSTGRES_OPTIONS.max,
        idle_timeout: RUNTIME_POSTGRES_OPTIONS.idle_timeout,
        prepare: false,
      })
    );
  });

  it("closes the previous client when the URL changes", async () => {
    const postgres = (await import("postgres")).default as unknown as ReturnType<typeof vi.fn>;
    const { getDb } = await import("@/db/client");

    getDb();
    const firstClient = postgres.mock.results[0]?.value as { end: ReturnType<typeof vi.fn> };

    process.env.POSTGRES_URL = "postgresql://pooler.example:6543/postgres";
    getDb();

    expect(firstClient.end).toHaveBeenCalled();
    expect(postgres).toHaveBeenCalledTimes(2);
  });

  it("loads the company catalog before opening the user transaction", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/server/actions/index.ts"),
      "utf8"
    );
    const start = source.indexOf("export async function getSuggestedBoards");
    const end = source.indexOf("export async function addSavedBoardFromCatalog");
    const fn = source.slice(start, end);
    expect(fn.indexOf("loadCompanyRegistry()")).toBeGreaterThan(-1);
    expect(fn.indexOf("loadCompanyRegistry()")).toBeLessThan(fn.indexOf("withUserDb("));
  });

  it("loads discovery data in one call so the catalog read is not concurrent with a user transaction", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/discovery/page.tsx"),
      "utf8"
    );
    expect(page).not.toContain("await Promise.all");
    expect(page).toContain("getDiscoveryPageData");

    const source = readFileSync(resolve(process.cwd(), "src/server/actions/index.ts"), "utf8");
    const start = source.indexOf("export async function getDiscoveryPageData");
    const end = source.indexOf("export async function getSavedBoardsWithHealth");
    const fn = source.slice(start, end);
    expect(fn.indexOf("loadCompanyRegistry()")).toBeGreaterThan(-1);
    expect(fn.indexOf("loadCompanyRegistry()")).toBeLessThan(fn.indexOf("withUserDb("));
  });

  it("does not Promise.all separate database calls on other dashboard pages", () => {
    for (const page of [
      "src/app/(dashboard)/dashboard/page.tsx",
      "src/app/(dashboard)/settings/page.tsx",
      "src/app/(dashboard)/jobs/page.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), page), "utf8");
      expect(source, page).not.toContain("await Promise.all");
    }
  });
});
