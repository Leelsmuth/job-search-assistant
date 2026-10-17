import { beforeEach, describe, expect, it, vi } from "vitest";

const kickDiscoverBatch = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cron-discover-kick", () => ({
  kickDiscoverBatch,
}));

vi.mock("@/lib/supabase/server", () => ({
  getUser,
}));

import { runDiscoveryNow } from "@/server/actions/discovery-actions";

describe("runDiscoveryNow", () => {
  beforeEach(() => {
    kickDiscoverBatch.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns the queue error instead of throwing", async () => {
    kickDiscoverBatch.mockRejectedValue(
      new Error("Discovery continuation could not be queued (could not determine data type of parameter $2).")
    );

    await expect(runDiscoveryNow()).resolves.toEqual({
      ok: false,
      error: "Discovery continuation could not be queued (could not determine data type of parameter $2).",
    });
  });

  it("returns ok when the batch is queued", async () => {
    kickDiscoverBatch.mockResolvedValue(undefined);
    await expect(runDiscoveryNow()).resolves.toEqual({ ok: true });
  });
});
