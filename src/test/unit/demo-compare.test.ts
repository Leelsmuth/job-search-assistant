import { describe, expect, it } from "vitest";
import {
  DEMO_COMPARE_MAX,
  DEMO_COMPARE_MIN,
  EMPTY_COMPARE_SLOTS,
  canCompare,
  compareDropPreview,
  compareJobs,
  compareNotice,
  compareRejection,
  filledIds,
  parseCompareSlots,
  placeInCompare,
  removeFromCompare,
  type CompareSlots,
} from "@/modules/demo/demo-compare";
import { DEMO_JOBS } from "@/modules/demo/sample-jobs";

const NORTHWIND = "northwind-senior-frontend"; // fit 91, CAD 165k max, 5h ago
const MAPLE = "maple-pine-design-systems"; // fit 86, CAD 135k max, 20h ago
const QUILL = "quill-graphql-frontend"; // fit 83, CAD 145k max, 12h ago
const TIDEWATER = "tidewater-web-platform"; // fit 80, USD
const LUMEN = "lumen-staff-frontend"; // fit 78, CAD 210k max

const _ = null;

function slots(...ids: (string | null)[]): CompareSlots {
  return [...ids, ...EMPTY_COMPARE_SLOTS].slice(0, DEMO_COMPARE_MAX);
}

describe("compare tray rules", () => {
  it("holds two to four roles", () => {
    expect(DEMO_COMPARE_MIN).toBe(2);
    expect(DEMO_COMPARE_MAX).toBe(4);
    expect(EMPTY_COMPARE_SLOTS).toEqual([_, _, _, _]);
  });

  it("needs at least two roles before comparing, wherever they sit", () => {
    expect(canCompare(EMPTY_COMPARE_SLOTS)).toBe(false);
    expect(canCompare(slots(_, _, NORTHWIND))).toBe(false);
    expect(canCompare(slots(NORTHWIND, _, _, MAPLE))).toBe(true);
  });

  it("without a slot, fills the first empty one", () => {
    let tray = EMPTY_COMPARE_SLOTS;
    for (const id of [QUILL, NORTHWIND, MAPLE]) tray = placeInCompare(tray, id).slots;
    expect(tray).toEqual([QUILL, NORTHWIND, MAPLE, _]);
    expect(placeInCompare(slots(NORTHWIND, _, MAPLE), QUILL)).toMatchObject({
      outcome: "added",
      slot: 1,
      slots: [NORTHWIND, QUILL, MAPLE, _],
    });
  });

  it("puts a dropped job in the exact slot it was dropped on, leaving gaps as they are", () => {
    const placed = placeInCompare(EMPTY_COMPARE_SLOTS, NORTHWIND, 2);
    expect(placed).toEqual({ outcome: "added", slot: 2, shifted: [], slots: [_, _, NORTHWIND, _] });
    expect(placeInCompare(placed.slots, MAPLE, 3).slots).toEqual([_, _, NORTHWIND, MAPLE]);
  });

  it("makes room when dropped on a taken slot, shifting towards the nearest empty slot after it", () => {
    const placed = placeInCompare(slots(NORTHWIND, MAPLE, _, LUMEN), QUILL, 1);
    expect(placed.slot).toBe(1);
    expect(placed.slots).toEqual([NORTHWIND, QUILL, MAPLE, LUMEN]);
    expect(placed.shifted).toEqual([MAPLE]);
  });

  it("shifts towards an empty slot before it when there is none after", () => {
    const placed = placeInCompare(slots(_, NORTHWIND, MAPLE, LUMEN), QUILL, 2);
    expect(placed.slots).toEqual([NORTHWIND, MAPLE, QUILL, LUMEN]);
    expect(placed.slot).toBe(2);
    expect(placed.shifted).toEqual([NORTHWIND, MAPLE]);
  });

  it("never pushes a role out", () => {
    for (let target = 0; target < DEMO_COMPARE_MAX; target++) {
      const { slots: next } = placeInCompare(slots(NORTHWIND, MAPLE, _, LUMEN), QUILL, target);
      expect([...filledIds(next)].sort()).toEqual([NORTHWIND, MAPLE, LUMEN, QUILL].sort());
      expect(next[target]).toBe(QUILL);
    }
  });

  it("moves a job already in the tray to the slot it is dropped on", () => {
    expect(placeInCompare(slots(NORTHWIND, _, MAPLE), NORTHWIND, 3)).toEqual({
      outcome: "moved",
      slot: 3,
      shifted: [],
      slots: [_, _, MAPLE, NORTHWIND],
    });
    // Onto a taken slot: the job there makes room.
    expect(placeInCompare(slots(NORTHWIND, MAPLE, QUILL), QUILL, 0).slots).toEqual([
      QUILL,
      NORTHWIND,
      MAPLE,
      _,
    ]);
    // A full tray can still be reordered.
    expect(placeInCompare(slots(NORTHWIND, MAPLE, QUILL, LUMEN), LUMEN, 0).slots).toEqual([
      LUMEN,
      NORTHWIND,
      MAPLE,
      QUILL,
    ]);
  });

  it("treats a job dropped back on its own slot, or added again without a slot, as a duplicate", () => {
    const tray = slots(_, NORTHWIND);
    expect(placeInCompare(tray, NORTHWIND, 1)).toEqual({ outcome: "duplicate", slot: 1, shifted: [], slots: tray });
    expect(placeInCompare(tray, NORTHWIND).outcome).toBe("duplicate");
    expect(compareRejection(tray, NORTHWIND)).toBe("duplicate");
    expect(compareRejection(tray, NORTHWIND, 3)).toBeNull();
  });

  it("refuses a fifth role and leaves the tray as it was", () => {
    const full = slots(NORTHWIND, MAPLE, QUILL, LUMEN);
    for (const target of [undefined, 0, 3]) {
      const placed = placeInCompare(full, TIDEWATER, target);
      expect(placed.outcome).toBe("full");
      expect(placed.slots).toBe(full);
    }
    expect(compareRejection(full, TIDEWATER)).toBe("full");
  });

  it("refuses ids that are not sample jobs, such as live jobs", () => {
    expect(placeInCompare(EMPTY_COMPARE_SLOTS, "greenhouse-12345", 0).outcome).toBe("unknown");
  });

  it("clamps a slot outside the tray to the nearest real slot", () => {
    expect(placeInCompare(EMPTY_COMPARE_SLOTS, NORTHWIND, 9).slot).toBe(3);
    expect(placeInCompare(EMPTY_COMPARE_SLOTS, NORTHWIND, -2).slot).toBe(0);
  });

  it("empties a removed job's slot and keeps everyone else in place", () => {
    const tray = slots(NORTHWIND, MAPLE, QUILL);
    expect(removeFromCompare(tray, MAPLE)).toEqual([NORTHWIND, _, QUILL, _]);
    expect(removeFromCompare(tray, LUMEN)).toBe(tray);
  });
});

describe("compareDropPreview", () => {
  it("says where the job will land and who makes room", () => {
    expect(compareDropPreview(slots(NORTHWIND), MAPLE, 2)).toEqual({
      tone: "info",
      accept: true,
      text: "Drop into slot 3.",
    });
    expect(compareDropPreview(slots(NORTHWIND, MAPLE), QUILL, 0).text).toBe(
      "Drop into slot 1; 2 roles move over."
    );
    expect(compareDropPreview(slots(NORTHWIND), QUILL, 0).text).toBe(
      "Drop into slot 1; Senior Frontend Engineer moves over."
    );
    expect(compareDropPreview(slots(NORTHWIND), MAPLE).text).toBe("Drop on a slot to choose its place.");
  });

  it("offers a move for a job already in the tray", () => {
    expect(compareDropPreview(slots(NORTHWIND, MAPLE), NORTHWIND, 3)).toMatchObject({
      accept: true,
      text: "Drop to move it to slot 4.",
    });
    expect(compareDropPreview(slots(NORTHWIND, MAPLE), NORTHWIND, 0)).toMatchObject({
      accept: false,
      text: "It is already in this slot.",
    });
    expect(compareDropPreview(slots(NORTHWIND), NORTHWIND).text).toBe(
      "Already in compare. Drop it on another slot to move it."
    );
  });

  it("refuses a new job when the tray is full", () => {
    expect(compareDropPreview(slots(NORTHWIND, MAPLE, QUILL, LUMEN), TIDEWATER, 1)).toEqual({
      tone: "warning",
      accept: false,
      text: "Compare is full. Remove a role to add another.",
    });
  });
});

describe("parseCompareSlots", () => {
  it("keeps each job in its slot, gaps included", () => {
    expect(parseCompareSlots([_, MAPLE, _, NORTHWIND])).toEqual([_, MAPLE, _, NORTHWIND]);
  });

  it("turns unknown ids, non-strings, and repeats into empty slots", () => {
    expect(parseCompareSlots([MAPLE, "gone", MAPLE, 7])).toEqual([MAPLE, _, _, _]);
  });

  it("reads the older format, a plain list of ids", () => {
    expect(parseCompareSlots([MAPLE, NORTHWIND])).toEqual([MAPLE, NORTHWIND, _, _]);
  });

  it("caps a hand-edited list at the tray size", () => {
    const all = DEMO_JOBS.map((sample) => sample.id);
    expect(parseCompareSlots(all)).toEqual(all.slice(0, DEMO_COMPARE_MAX));
  });

  it("treats anything but an array as an empty tray", () => {
    for (const value of [null, undefined, "northwind-senior-frontend", { 0: MAPLE }, 3]) {
      expect(parseCompareSlots(value)).toEqual(EMPTY_COMPARE_SLOTS);
    }
  });
});

describe("compareJobs", () => {
  it("returns the sample jobs in slot order, skipping empty slots", () => {
    expect(compareJobs([_, MAPLE, _, NORTHWIND]).map((sample) => sample.id)).toEqual([MAPLE, NORTHWIND]);
  });
});

describe("compareNotice", () => {
  it("says which slot a job went to, and counts down to the minimum", () => {
    expect(compareNotice(placeInCompare(EMPTY_COMPARE_SLOTS, NORTHWIND, 2), NORTHWIND).text).toBe(
      "Added Senior Frontend Engineer at Northwind Labs to slot 3. Add one more role to compare."
    );
    expect(compareNotice(placeInCompare(slots(NORTHWIND), MAPLE), MAPLE).text).toBe(
      "Added Frontend Developer, Design Systems at Maple & Pine Commerce to slot 2. 2 of 4 roles ready to compare."
    );
  });

  it("mentions roles that moved over to make room", () => {
    expect(compareNotice(placeInCompare(slots(NORTHWIND), MAPLE, 0), MAPLE).text).toBe(
      "Added Frontend Developer, Design Systems at Maple & Pine Commerce to slot 1. Senior Frontend Engineer moved over to make room. 2 of 4 roles ready to compare."
    );
    expect(compareNotice(placeInCompare(slots(NORTHWIND, MAPLE), NORTHWIND, 3), NORTHWIND).text).toBe(
      "Moved Senior Frontend Engineer at Northwind Labs to slot 4."
    );
  });

  it("warns when the tray is full or already has the role", () => {
    expect(compareNotice(placeInCompare(slots(NORTHWIND, MAPLE, QUILL, LUMEN), TIDEWATER), TIDEWATER)).toEqual({
      tone: "warning",
      text: "Compare holds up to 4 roles. Remove one to add Senior Software Engineer, Web Platform at Tidewater Fintech.",
    });
    expect(compareNotice(placeInCompare(slots(_, NORTHWIND), NORTHWIND), NORTHWIND)).toEqual({
      tone: "warning",
      text: "Senior Frontend Engineer at Northwind Labs is already in slot 2.",
    });
    expect(compareNotice(placeInCompare(EMPTY_COMPARE_SLOTS, "greenhouse-1"), "greenhouse-1").tone).toBe("warning");
  });
});
