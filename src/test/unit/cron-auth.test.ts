import { describe, it, expect, afterEach } from "vitest";
import { verifyCronAuth } from "@/lib/cron-auth";

describe("verifyCronAuth", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it("fails closed when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    const result = verifyCronAuth("Bearer anything");
    expect(result).toEqual({ ok: false, status: 503, error: "Cron not configured" });
  });

  it("rejects missing or wrong bearer token", () => {
    process.env.CRON_SECRET = "test-secret";
    expect(verifyCronAuth(null)).toEqual({ ok: false, status: 401, error: "Unauthorized" });
    expect(verifyCronAuth("Bearer wrong")).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
  });

  it("accepts valid bearer token", () => {
    process.env.CRON_SECRET = "test-secret";
    expect(verifyCronAuth("Bearer test-secret")).toEqual({ ok: true });
  });
});
