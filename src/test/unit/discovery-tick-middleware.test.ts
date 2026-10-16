import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }),
}));

import { middleware } from "@/middleware";
import { POST } from "@/app/api/discovery/tick/route";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function configureApp() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.DATABASE_URL = "postgresql://localhost:5432/postgres";
  process.env.CRON_SECRET = "test-secret";
}

function post(pathname: string) {
  return new NextRequest(`https://jobs.example${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

describe("discovery tick middleware", () => {
  it("lets an unauthenticated POST reach the handler and returns 401 without a bearer", async () => {
    configureApp();
    const request = post("/api/discovery/tick");

    const passed = await middleware(request);

    expect(passed.status).toBeLessThan(300);
    expect(passed.headers.get("location")).toBeNull();

    const response = await POST(request);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("still redirects an unauthenticated page request to login", async () => {
    configureApp();
    const response = await middleware(post("/jobs"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});
