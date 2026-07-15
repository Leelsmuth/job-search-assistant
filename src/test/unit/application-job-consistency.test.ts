import { describe, it, expect } from "vitest";
import { assertApplicationMatchesJob } from "@/server/actions/helpers";

describe("assertApplicationMatchesJob", () => {
  it("passes when job IDs match", () => {
    expect(() => assertApplicationMatchesJob("job-a", "job-a")).not.toThrow();
  });

  it("throws when job IDs differ", () => {
    expect(() => assertApplicationMatchesJob("job-a", "job-b")).toThrow(
      "Application does not match this job"
    );
  });
});
