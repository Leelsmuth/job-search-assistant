import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  withUserDb: vi.fn(),
  execute: vi.fn(),
  buildDigestForUser: vi.fn(),
  recordDigestSkip: vi.fn(),
  markDigestSent: vi.fn(),
  sendDigestEmail: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({ execute: state.execute }),
}));

vi.mock("@/db/user-context", () => ({
  withUserDb: state.withUserDb,
}));

vi.mock("@/modules/digest/build", () => ({
  buildDigestForUser: state.buildDigestForUser,
  recordDigestSkip: state.recordDigestSkip,
  markDigestSent: state.markDigestSent,
}));

vi.mock("@/modules/digest/email", () => ({
  renderDigestEmail: () => ({ subject: "Morning digest", html: "<p>Hi</p>", text: "Hi" }),
  sendDigestEmail: state.sendDigestEmail,
}));

import { handleCronDigestRequest, runDailyDigest } from "@/lib/cron-digest-handler";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const stored = {
  outcome: "stored" as const,
  digestId: "digest-1",
  payload: {
    generatedAt: "2026-10-14T12:00:00.000Z",
    windowStart: "2026-10-13T12:00:00.000Z",
    windowEnd: "2026-10-14T12:00:00.000Z",
    jobs: [],
    followUps: [],
    staleApplied: [],
  },
  subject: "Morning digest",
  emailsEnabled: true,
  alreadySentToday: false,
};

describe("daily digest cron", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.DIGEST_FROM_EMAIL;
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    state.withUserDb.mockReset();
    state.execute.mockReset();
    state.buildDigestForUser.mockReset();
    state.recordDigestSkip.mockReset();
    state.markDigestSent.mockReset();
    state.sendDigestEmail.mockReset();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.DIGEST_FROM_EMAIL;
    else process.env.DIGEST_FROM_EMAIL = originalFrom;
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("keeps database work sequential and off the model", () => {
    const handler = readFileSync(resolve(process.cwd(), "src/lib/cron-digest-handler.ts"), "utf8");
    const build = readFileSync(resolve(process.cwd(), "src/modules/digest/build.ts"), "utf8");
    const actions = readFileSync(resolve(process.cwd(), "src/server/actions/digest-actions.ts"), "utf8");
    const route = readFileSync(resolve(process.cwd(), "src/app/api/cron/digest/route.ts"), "utf8");
    for (const source of [handler, build, actions]) {
      expect(source).not.toContain("Promise.all");
      expect(source).not.toMatch(/openai|maybeEnhanceFrontendFit/);
    }
    expect(handler).toContain("withUserDb");
    expect(handler).toContain("for (const userId of userIds)");
    expect(handler).toContain("verifyCronAuth");
    expect(route).toContain("handleCronDigestRequest");
    expect(route).toContain("console.error");
    expect(actions.startsWith('"use server"')).toBe(true);
    const exported = actions.match(/^export .+$/gm) ?? [];
    expect(exported.length).toBeGreaterThan(0);
    for (const line of exported) {
      expect(line).toMatch(/^export async function /);
    }
  });

  it("does not email when there is nothing new and no reminders", async () => {
    state.execute.mockResolvedValueOnce([{ user_id: USER_ID }]);
    state.withUserDb.mockImplementation(async (_userId: string, fn: (db: object) => Promise<unknown>) => fn({}));
    state.buildDigestForUser.mockResolvedValue({ outcome: "empty" });

    const summary = await runDailyDigest();

    expect(summary.empty).toBe(1);
    expect(summary.emailed).toBe(0);
    expect(state.sendDigestEmail).not.toHaveBeenCalled();
    expect(state.markDigestSent).not.toHaveBeenCalled();
  });

  it("stores the digest and skips email when Resend is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.DIGEST_FROM_EMAIL;
    state.execute.mockResolvedValueOnce([{ user_id: USER_ID }]);
    state.withUserDb.mockImplementation(async (_userId: string, fn: (db: object) => Promise<unknown>) => fn({}));
    state.buildDigestForUser.mockResolvedValue(stored);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const summary = await runDailyDigest();

    expect(summary.stored).toBe(1);
    expect(summary.skipped.resend_not_configured).toBe(1);
    expect(state.sendDigestEmail).not.toHaveBeenCalled();
    expect(state.recordDigestSkip).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("RESEND_API_KEY"),
      expect.objectContaining({ userId: USER_ID })
    );
    info.mockRestore();
  });

  it("emails the auth address once and records the send", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.DIGEST_FROM_EMAIL = "Job Search <onboarding@resend.dev>";
    state.execute
      .mockResolvedValueOnce([{ user_id: USER_ID }])
      .mockResolvedValueOnce([{ email: "owner@example.com" }]);
    state.withUserDb.mockImplementation(async (_userId: string, fn: (db: object) => Promise<unknown>) => fn({}));
    state.buildDigestForUser.mockResolvedValue(stored);
    state.sendDigestEmail.mockResolvedValue({ ok: true });

    const summary = await runDailyDigest();

    expect(summary.emailed).toBe(1);
    expect(state.sendDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@example.com", subject: "Morning digest" })
    );
    expect(state.markDigestSent).toHaveBeenCalled();
    expect(state.withUserDb.mock.calls.length).toBe(2);
  });

  it("requires the cron secret", async () => {
    process.env.CRON_SECRET = "test-secret";
    const denied = await handleCronDigestRequest(null);
    expect(denied.status).toBe(401);
    const allowed = await handleCronDigestRequest("Bearer test-secret");
    expect(allowed.status).toBe(200);
  });
});
