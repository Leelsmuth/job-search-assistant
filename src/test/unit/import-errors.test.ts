import { describe, it, expect } from "vitest";
import { mapImportError } from "@/lib/import-errors";

describe("mapImportError", () => {
  it("maps fetch failures to actionable message", () => {
    expect(mapImportError("Failed to fetch Greenhouse job")).toContain("past");
  });

  it("maps payload size errors", () => {
    expect(mapImportError("Import payload too large")).toContain("too large");
  });

  it("maps validation errors", () => {
    expect(mapImportError("ZodError: String must contain at least 1 character")).toContain(
      "invalid"
    );
  });

  it("returns generic message for unknown errors", () => {
    expect(mapImportError("Something unexpected")).toBe(
      "Import failed. Check your input and try again."
    );
  });
});
