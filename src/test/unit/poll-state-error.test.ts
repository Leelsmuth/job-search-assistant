import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatPollError } from "@/modules/discovery/poll-error";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0024_poll_state_last_error.sql"),
  "utf8"
);

describe("curated poll error", () => {
  it("stores a short error string from the thrown value", () => {
    expect(formatPollError(new TypeError("input.datePosted?.trim is not a function"))).toBe(
      "TypeError: input.datePosted?.trim is not a function"
    );
    expect(formatPollError(new Error(`x${"y".repeat(800)}`)).length).toBe(500);
    expect(formatPollError("HTTP 500")).toBe("HTTP 500");
  });

  it("adds last_error to the shared poll table", () => {
    expect(migration).toContain("ALTER TABLE curated_board_poll_state");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS last_error text");
    expect(migration).not.toMatch(/Bearer [A-Za-z0-9+/=]{16,}/);
  });
});
