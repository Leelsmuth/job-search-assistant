import { describe, it, expect } from "vitest";
import {
  parseExperienceHeaderFields,
  parseExperienceBlocks,
  mergeSplitExperienceBlocks,
} from "@/modules/resumes/parse/experience-block-parser";
import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";

function linesFromText(text: string): GroupedLine[] {
  return text.split("\n").map((t, i) => ({ text: t, page: 1, lineIndex: i }));
}

describe("experience-block-parser", () => {
  it("parses Company | Title | Date | Location", () => {
    const fields = parseExperienceHeaderFields(
      "Priceline | Software Developer | Jun 2022 - Present | Remote"
    );
    expect(fields.company).toBe("Priceline");
    expect(fields.title).toBe("Software Developer");
    expect(fields.dateRange).toMatch(/Jun 2022 - Present/i);
    expect(fields.location).toBe("Remote");
  });

  it("parses Title | Date (not Company | Title)", () => {
    const fields = parseExperienceHeaderFields(
      "Software Developer | Jun 2022 - Present"
    );
    expect(fields.title).toBe("Software Developer");
    expect(fields.dateRange).toMatch(/Jun 2022 - Present/i);
    expect(fields.company).toBeUndefined();
  });

  it("parses Date at Title format", () => {
    const fields = parseExperienceHeaderFields(
      "Nov 2020 - Oct 2021 at Software Developer"
    );
    expect(fields.dateRange).toMatch(/Nov 2020 - Oct 2021/i);
    expect(fields.title).toBe("Software Developer");
  });

  it("merges swapped title|date block with following company block", () => {
    const blocks = mergeSplitExperienceBlocks([
      {
        headerLine: "Software Developer | Jun 2022 - Present",
        lines: [],
        company: "Software Developer",
        title: "Jun 2022 - Present",
      },
      {
        headerLine: "Priceline",
        lines: linesFromText("- Built features"),
        title: "Priceline",
      },
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].company).toBe("Priceline");
    expect(blocks[0].title).toBe("Software Developer");
    expect(blocks[0].dateRange).toMatch(/Jun 2022 - Present/i);
  });

  it("parses stacked company then title|date layout", () => {
    const input = `Priceline
Software Developer | Jun 2022 - Present | Remote
- Architected Okta-based authentication migration.`;

    const blocks = parseExperienceBlocks(linesFromText(input));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].company).toBe("Priceline");
    expect(blocks[0].title).toBe("Software Developer");
    expect(blocks[0].dateRange).toMatch(/Jun 2022 - Present/i);
    expect(blocks[0].lines.some((l) => /Okta/i.test(l.text))).toBe(true);
  });

  it("parses split title|date then company-with-bullets layout", () => {
    const input = `Software Developer | Jun 2022 - Present
Priceline
- Architected Okta-based authentication migration.`;

    const blocks = parseExperienceBlocks(linesFromText(input));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].company).toBe("Priceline");
    expect(blocks[0].title).toBe("Software Developer");
    expect(blocks[0].dateRange).toMatch(/Jun 2022 - Present/i);
  });

  it("parses vertical date → title → company → bullets layout", () => {
    const input = `Jun 2022 – Present
Software Developer
Priceline
- Architected and migrated legacy authentication to a React and Node.js Okta-based system.
- Led frontend modernization using Next.js, TypeScript, and shadcn/ui.`;

    const blocks = parseExperienceBlocks(linesFromText(input));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].company).toBe("Priceline");
    expect(blocks[0].title).toBe("Software Developer");
    expect(blocks[0].dateRange).toMatch(/Jun 2022/i);
    expect(blocks[0].lines.filter((l) => /^-/.test(l.text.trim()))).toHaveLength(2);
  });
});
