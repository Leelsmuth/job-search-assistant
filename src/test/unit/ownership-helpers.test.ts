import { describe, it, expect } from "vitest";
import { filterApplicationsForOwnedJobs } from "@/server/actions/helpers";

describe("filterApplicationsForOwnedJobs", () => {
  const userId = "user-a";

  it("keeps applications whose job belongs to the user", () => {
    const rows = [
      { id: "1", job: { userId: "user-a" } },
      { id: "2", job: { userId: "user-b" } },
      { id: "3", job: { userId: "user-a" } },
    ];
    expect(filterApplicationsForOwnedJobs(userId, rows)).toHaveLength(2);
  });

  it("drops rows with missing job relation", () => {
    const rows = [
      { id: "1", job: null },
      { id: "2", job: { userId: "user-a" } },
    ];
    expect(filterApplicationsForOwnedJobs(userId, rows)).toHaveLength(1);
  });
});
