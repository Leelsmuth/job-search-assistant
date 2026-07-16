import { describe, it, expect } from "vitest";
import {
  isTailorableBullet,
  scoreBulletForJob,
  selectTailoringBullets,
} from "@/modules/ai/tailoring-eligibility";

describe("isTailorableBullet", () => {
  it("rejects email and contact lines", () => {
    expect(isTailorableBullet("john.doe@email.com")).toBe(false);
    expect(isTailorableBullet("Jane Doe | Senior Engineer | jane@co.com")).toBe(false);
    expect(isTailorableBullet("linkedin.com/in/janedoe")).toBe(false);
  });

  it("rejects bare titles without achievements", () => {
    expect(isTailorableBullet("Senior Frontend Engineer")).toBe(false);
  });

  it("accepts achievement bullets", () => {
    expect(
      isTailorableBullet(
        "Built React dashboards with TypeScript and GraphQL, improving load time by 30%"
      )
    ).toBe(true);
  });
});

describe("selectTailoringBullets", () => {
  it("ranks job-relevant bullets first", () => {
    const bullets = [
      { id: "1", text: "Managed office supply inventory and vendor relationships" },
      {
        id: "2",
        text: "Built React component libraries with TypeScript and GraphQL for customer dashboards",
      },
    ];
    const selected = selectTailoringBullets(bullets, "Looking for React TypeScript frontend engineer");
    expect(selected[0].id).toBe("2");
  });

  it("filters out contact noise", () => {
    const bullets = [
      { id: "1", text: "bolanle@example.com" },
      {
        id: "2",
        text: "Developed scalable frontend features using React and Next.js for production users",
      },
    ];
    const selected = selectTailoringBullets(bullets, "React Next.js role");
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("2");
  });
});

describe("scoreBulletForJob", () => {
  it("scores higher when terms overlap", () => {
    const job = "React TypeScript frontend";
    const a = scoreBulletForJob("Built React apps with TypeScript", job);
    const b = scoreBulletForJob("Managed payroll processing", job);
    expect(a).toBeGreaterThan(b);
  });
});
