import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  getUserCalls: 0,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: { setAll: (cookies: { name: string; value: string }[]) => void };
  }) => ({
    auth: {
      getUser: async () => {
        auth.getUserCalls += 1;
        if (auth.user) options.cookies.setAll([{ name: "test-session", value: "refreshed" }]);
        return { data: { user: auth.user }, error: null };
      },
    },
  }),
}));

import { middleware } from "@/middleware";
import { isDemoPath } from "@/lib/env";

const originalEnv = { ...process.env };

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL",
  "SUPABASE_DB_URL",
];

beforeEach(() => {
  auth.user = null;
  auth.getUserCalls = 0;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

function unconfigure() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function configure() {
  unconfigure();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.DATABASE_URL = "postgresql://localhost:5432/postgres";
}

function get(pathname: string) {
  return new NextRequest(`https://jobs.example${pathname}`);
}

function expectPassThrough(response: Response) {
  expect(response.status).toBeLessThan(300);
  expect(response.headers.get("location")).toBeNull();
}

function expectRedirect(response: Response, pathname: string) {
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get("location")!).pathname).toBe(pathname);
}

describe("isDemoPath", () => {
  it("matches the demo, its sub-pages, and its API only", () => {
    expect(isDemoPath("/demo")).toBe(true);
    expect(isDemoPath("/demo/applications")).toBe(true);
    expect(isDemoPath("/demo/jobs/northwind-senior-frontend")).toBe(true);
    expect(isDemoPath("/api/demo/live-jobs")).toBe(true);
    expect(isDemoPath("/demonstration")).toBe(false);
    expect(isDemoPath("/api/demonstration")).toBe(false);
    expect(isDemoPath("/api/extension/session")).toBe(false);
    expect(isDemoPath("/jobs")).toBe(false);
    expect(isDemoPath("/")).toBe(false);
  });
});

describe("demo and landing access with no configuration", () => {
  it.each([
    "/",
    "/demo",
    "/demo/applications",
    "/demo/jobs/northwind-senior-frontend",
    "/api/demo/live-jobs",
  ])(
    "serves %s without env vars",
    async (pathname) => {
      unconfigure();
      expectPassThrough(await middleware(get(pathname)));
    }
  );

  it("still sends app pages to the configuration notice", async () => {
    unconfigure();
    const response = await middleware(get("/applications"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=missing_env");
  });
});

describe("demo and landing access when Supabase is configured", () => {
  it.each([
    "/demo",
    "/demo/applications?view=board",
    "/demo/jobs/northwind-senior-frontend",
    "/api/demo/live-jobs",
  ])(
    "serves %s to anonymous visitors without an auth round trip",
    async (pathname) => {
      configure();
      expectPassThrough(await middleware(get(pathname)));
      expect(auth.getUserCalls).toBe(0);
    }
  );

  it("serves the landing page to anonymous visitors", async () => {
    configure();
    expectPassThrough(await middleware(get("/")));
  });

  it("sends signed-in users from the landing page to their jobs", async () => {
    configure();
    auth.user = { id: "user-1" };
    const response = await middleware(get("/"));
    expectRedirect(response, "/jobs");
    expect(response.cookies.get("test-session")?.value).toBe("refreshed");
  });

  it.each(["/jobs", "/applications", "/dashboard", "/settings", "/profile"])(
    "keeps %s behind sign-in",
    async (pathname) => {
      configure();
      expectRedirect(await middleware(get(pathname)), "/login");
    }
  );

  it("lets signed-in users open the demo too", async () => {
    configure();
    auth.user = { id: "user-1" };
    expectPassThrough(await middleware(get("/demo")));
  });
});
