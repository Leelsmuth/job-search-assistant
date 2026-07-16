import { describe, it, expect } from "vitest";
import {
  isContactOrHeaderLine,
  isLikelyExperienceBullet,
  filterExtractedBullets,
  normalizeBulletText,
} from "@/modules/resumes/resume-line-classifier";

describe("resume-line-classifier", () => {
  it("flags contact and section header lines", () => {
    expect(isContactOrHeaderLine("john@example.com")).toBe(true);
    expect(isContactOrHeaderLine("linkedin.com/in/john")).toBe(true);
    expect(isContactOrHeaderLine("Experience")).toBe(true);
    expect(isContactOrHeaderLine("2019 - Present")).toBe(true);
  });

  it("accepts explicit and achievement bullets", () => {
    expect(isLikelyExperienceBullet("- Built React features for the design system")).toBe(true);
    expect(
      isLikelyExperienceBullet(
        "Led migration to Next.js, reducing page load time by 40%"
      )
    ).toBe(true);
    expect(isLikelyExperienceBullet("Senior Frontend Engineer")).toBe(false);
  });

  it("strips bullet prefixes", () => {
    expect(normalizeBulletText("• Shipped checkout redesign")).toBe("Shipped checkout redesign");
  });

  it("filters non-achievement lines from extracted blocks", () => {
    const lines = [
      "john@example.com",
      "Senior Frontend Engineer",
      "- Built React features used by 2M users",
      "Led team of 4 engineers on migration project",
      "Skills: React, TypeScript",
    ];
    const bullets = filterExtractedBullets(lines);
    expect(bullets).toContain("Built React features used by 2M users");
    expect(bullets).toContain("Led team of 4 engineers on migration project");
    expect(bullets.some((b) => b.includes("@"))).toBe(false);
    expect(bullets.some((b) => /Senior Frontend/i.test(b))).toBe(false);
  });
});
