import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: { setAll: (cookies: { name: string; value: string }[]) => void };
  }) => ({
    auth: { getUser: () => getUser(options.cookies) },
  }),
}));

import { middleware } from "@/middleware";

function request(path: string) {
  return new NextRequest(`https://jobs.example${path}`);
}

describe("demo access with the regular app configured", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "placeholder");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/postgres");
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: null } });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("serves demo routes without consulting Supabase", async () => {
    for (const route of ["/demo", "/demo/applications"]) {
      expect((await middleware(request(route))).status).toBe(200);
    }
    expect(getUser).not.toHaveBeenCalled();
  });

  it("serves the public landing page while keeping regular routes protected", async () => {
    expect((await middleware(request("/"))).status).toBe(200);
    for (const route of ["/jobs", "/applications"]) {
      expect((await middleware(request(route))).headers.get("location")).toBe("https://jobs.example/login");
    }
  });

  it("still takes signed-in visitors from the root to their jobs", async () => {
    getUser.mockImplementation(async (cookies) => {
      cookies.setAll([{ name: "demo-test-session", value: "refreshed" }]);
      return { data: { user: { id: "user" } } };
    });
    const response = await middleware(request("/"));
    expect(response.headers.get("location")).toBe("https://jobs.example/jobs");
    expect(response.cookies.get("demo-test-session")?.value).toBe("refreshed");
  });
});
