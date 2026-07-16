import { describe, it, expect } from "vitest";
import { newEntityId } from "@/lib/entity-id";

describe("newEntityId", () => {
  it("returns unique string ids", () => {
    const a = newEntityId();
    const b = newEntityId();
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
