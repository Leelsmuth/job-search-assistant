import { describe, expect, it } from "vitest";
import { groupItemsIntoLines, mergeWrappedLines } from "@/modules/resumes/normalize/line-grouper";
import type { ExtractedTextItem } from "@/modules/resumes/extract/types";

describe("line grouper inline bullets", () => {
  it("merges a tiny inline glyph with its wrapped continuation", () => {
    const items: ExtractedTextItem[] = [
      {
        text: "•",
        page: 1,
        x: 52,
        y: 400,
        width: 0.23,
        fontSize: 0.75,
      },
      {
        text: "Architected a shared component library that cut interface",
        page: 1,
        x: 52,
        y: 400,
        width: 280,
        fontSize: 8,
      },
      {
        text: "delivery time by 35 percent.",
        page: 1,
        x: 52,
        y: 388,
        width: 160,
        fontSize: 8,
      },
    ];

    const lines = mergeWrappedLines(groupItemsIntoLines(items));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.isBullet).toBe(true);
    expect(lines[0]?.text).toBe(
      "• Architected a shared component library that cut interface delivery time by 35 percent."
    );
  });
});
