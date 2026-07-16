import { describe, it, expect } from "vitest";
import { hashJobDescription } from "@/modules/ingestion/description-hash";

describe("hashJobDescription", () => {
  it("returns stable hash for same content", () => {
    const a = hashJobDescription("Build React apps");
    const b = hashJobDescription("Build React apps");
    expect(a).toBe(b);
  });

  it("differs when content changes", () => {
    expect(hashJobDescription("Build React apps")).not.toBe(
      hashJobDescription("Build Vue apps")
    );
  });
});
