import { describe, it, expect, afterEach, vi } from "vitest";
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
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.CRON_SECRET;
    const result = verifyCronAuth("Bearer anything");
    expect(result).toEqual({ ok: false, status: 503, error: "CRON_SECRET is not set" });
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("CRON_SECRET is not set")
    );
    errorLog.mockRestore();
  });

  it("fails closed when CRON_SECRET is blank", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CRON_SECRET = "   ";
    const result = verifyCronAuth("Bearer    ");
    expect(result).toEqual({ ok: false, status: 503, error: "CRON_SECRET is not set" });
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
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
