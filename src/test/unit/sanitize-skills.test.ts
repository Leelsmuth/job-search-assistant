import { describe, expect, it } from "vitest";
import { sanitizeSkills } from "@/modules/candidate/sanitize-skills";

describe("sanitizeSkills", () => {
  it("keeps canonical technologies and drops resume lines, bullets, and company names", () => {
    const cleaned = sanitizeSkills([
      "React",
      "TypeScript",
      "Priceline",
      "and demos.",
      "• Architected a design system in React and Next.js for the marketing site.",
      "GraphQL, Node.js",
      "Customer obsessed collaborator",
    ]);
    expect(cleaned).toEqual(expect.arrayContaining(["React", "TypeScript", "Next.js", "GraphQL", "Node.js"]));
    expect(cleaned).not.toContain("Priceline");
    expect(cleaned.some((skill) => /priceline|demos|architected/i.test(skill))).toBe(false);
    expect(cleaned.every((skill) => skill.length < 40)).toBe(true);
  });

  it("does not turn React Native into React", () => {
    expect(sanitizeSkills(["React Native"])).toEqual(["React Native"]);
    expect(sanitizeSkills(["React and React Native"])).toEqual(
      expect.arrayContaining(["React", "React Native"])
    );
  });

  it("normalizes aliases", () => {
    expect(sanitizeSkills(["react.js", "typescript", "tailwindcss"])).toEqual(
      expect.arrayContaining(["React", "TypeScript", "Tailwind CSS"])
    );
  });
});
