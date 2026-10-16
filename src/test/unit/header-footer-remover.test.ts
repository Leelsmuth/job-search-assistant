import { describe, expect, it } from "vitest";
import { removeRepeatedHeadersFooters } from "@/modules/resumes/normalize/header-footer-remover";
import type { ExtractedTextItem } from "@/modules/resumes/extract/types";

function item(text: string, page: number, x: number, y: number): ExtractedTextItem {
  return { text, page, x, y, width: text.length * 4, fontSize: 8 };
}

describe("removeRepeatedHeadersFooters", () => {
  it("drops margin repeats and keeps the same words in the body", () => {
    const height = 792;
    const pages = [1, 2, 3].map((page) => ({
      pageNumber: page,
      height,
      items: [
        item("Software Developer", page, 40, 760),
        item("of", page, 200, 760),
        item("•", page, 280, 760),
        item("Key Contributions", page, 320, 760),
        item(String(page), page, 300, 24),
        item("Software Developer", page, 40, 500),
        item("Bank of Harbor", page, 40, 480),
        item("•", page, 40, 420),
        item("Key Contributions", page, 40, 450),
      ],
    }));

    const kept = removeRepeatedHeadersFooters(pages).map((entry) => entry.text);
    expect(kept.filter((text) => text === "Software Developer")).toHaveLength(3);
    expect(kept.filter((text) => text === "Bank of Harbor")).toHaveLength(3);
    expect(kept.filter((text) => text === "Key Contributions")).toHaveLength(3);
    expect(kept.filter((text) => text === "•")).toHaveLength(3);
    expect(kept).not.toContain("of");
    expect(kept).not.toContain("1");
    expect(kept).not.toContain("2");
    expect(kept).not.toContain("3");
  });
});
