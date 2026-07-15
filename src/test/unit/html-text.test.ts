import { describe, it, expect } from "vitest";
import {
  decodeHtmlEntities,
  htmlToPlainText,
  sanitizeJobTitle,
  extractTitleFromHtml,
} from "@/modules/ingestion/html-text";

describe("html-text utilities", () => {
  it("decodes HTML entities", () => {
    expect(decodeHtmlEntities("Priceline&#039;s team")).toBe("Priceline's team");
    expect(decodeHtmlEntities("A &amp; B")).toBe("A & B");
  });

  it("converts HTML to readable plain text", () => {
    const html = `<p><strong>Front End Developer</strong></p><p>Build with React.</p><ul><li>GraphQL</li><li>SQL</li></ul>`;
    const text = htmlToPlainText(html);
    expect(text).toContain("Front End Developer");
    expect(text).toContain("Build with React.");
    expect(text).toContain("• GraphQL");
  });

  it("rejects overly long titles", () => {
    const longTitle = "A".repeat(200);
    expect(sanitizeJobTitle(longTitle)).toBe("Untitled Role");
    expect(sanitizeJobTitle("Senior Frontend Engineer")).toBe("Senior Frontend Engineer");
  });

  it("extracts page title from HTML metadata", () => {
    const html = `<html><head><title>Front End Developer | Priceline Careers</title></head><body></body></html>`;
    expect(extractTitleFromHtml(html)).toBe("Front End Developer");
  });
});
