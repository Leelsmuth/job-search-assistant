/**
 * The compare tray: four slots that keep the place each role was dropped in.
 * Pure functions only. The demo keeps the tray in sessionStorage; signed-in
 * users keep it on their account (search_preferences.compare_slots).
 */

/** Comparing needs at least this many roles. */
export const COMPARE_MIN = 2;
/** The compare tray holds at most this many roles. */
export const COMPARE_MAX = 4;

/**
 * Drag data type for a role dragged into the compare tray.
 * Lower case: browsers lower-case custom types in `dataTransfer.types`.
 */
export const COMPARE_DRAG_TYPE = "application/x-jsa-compare-job";

/**
 * The tray, slot by slot: a role id, or null for an empty slot. Always
 * COMPARE_MAX long. Positions are kept exactly as the person left them, gaps
 * included: a role dropped on slot 3 stays in slot 3, and removing a role
 * leaves its slot empty rather than sliding the others along.
 */
export type CompareSlots = readonly (string | null)[];

export const EMPTY_COMPARE_SLOTS: CompareSlots = Object.freeze(
  Array.from({ length: COMPARE_MAX }, () => null)
);

/** What the rules need to know about roles: which ids can go in, and what to call them. */
export type CompareCatalog = {
  isKnown: (id: string) => boolean;
  describe: (id: string) => { title: string; company: string } | null;
};

export type CompareOutcome = "added" | "moved" | "duplicate" | "full" | "unknown";

export type ComparePlacement = {
  slots: CompareSlots;
  outcome: CompareOutcome;
  /** The slot the role ended up in (or already sat in, for a duplicate). Null when refused. */
  slot: number | null;
  /** Roles that shifted one slot to make room, in slot order. */
  shifted: string[];
};

/** Filled slots in slot order, gaps skipped. This is the comparison's column order. */
export function filledIds(slots: CompareSlots): string[] {
  return slots.filter((id): id is string => id !== null);
}

export function canCompare(slots: CompareSlots): boolean {
  return filledIds(slots).length >= COMPARE_MIN;
}

function clampSlot(slot: number): number {
  return Math.max(0, Math.min(COMPARE_MAX - 1, Math.trunc(slot)));
}

/**
 * Put a role in a slot that may be taken. Whatever is in the way shifts one
 * slot towards the nearest empty slot (after the target first, then before),
 * so the role lands exactly where it was dropped and nothing is pushed out.
 * The caller makes sure there is an empty slot.
 */
function placeAt(slots: CompareSlots, id: string, target: number) {
  const next = [...slots];
  if (next[target] === null) {
    next[target] = id;
    return { slots: next, shifted: [] as string[] };
  }
  let shifted: (string | null)[];
  const after = next.indexOf(null, target + 1);
  if (after !== -1) {
    shifted = next.slice(target, after);
    for (let index = after; index > target; index--) next[index] = next[index - 1];
  } else {
    const before = next.lastIndexOf(null, target - 1);
    shifted = next.slice(before + 1, target + 1);
    for (let index = before; index < target; index++) next[index] = next[index + 1];
  }
  next[target] = id;
  return { slots: next, shifted: shifted.filter((entry): entry is string => entry !== null) };
}

/**
 * Drop a role into the tray. With a target slot, the role lands in that slot;
 * without one (a row's Compare button, or a drop outside the slots) it takes
 * the first empty slot. A role already in the tray moves to the target slot.
 * Returns the same slots when nothing changes.
 */
export function placeInCompare(
  slots: CompareSlots,
  id: string,
  target: number | undefined,
  catalog: Pick<CompareCatalog, "isKnown">
): ComparePlacement {
  const refused = (outcome: CompareOutcome, slot: number | null = null): ComparePlacement => ({
    slots,
    outcome,
    slot,
    shifted: [],
  });
  if (!catalog.isKnown(id)) return refused("unknown");
  const wanted = target === undefined ? undefined : clampSlot(target);

  const current = slots.indexOf(id);
  if (current !== -1) {
    if (wanted === undefined || wanted === current) return refused("duplicate", current);
    const without = slots.map((entry) => (entry === id ? null : entry));
    return { ...placeAt(without, id, wanted), outcome: "moved", slot: wanted };
  }

  const firstEmpty = slots.indexOf(null);
  if (firstEmpty === -1) return refused("full");
  const slot = wanted ?? firstEmpty;
  return { ...placeAt(slots, id, slot), outcome: "added", slot };
}

/** Why a role cannot be dropped here right now, or null when it can. */
export function compareRejection(
  slots: CompareSlots,
  id: string,
  target: number | undefined,
  catalog: Pick<CompareCatalog, "isKnown">
): Extract<CompareOutcome, "duplicate" | "full" | "unknown"> | null {
  const { outcome } = placeInCompare(slots, id, target, catalog);
  return outcome === "added" || outcome === "moved" ? null : outcome;
}

/** Empty the role's slot. The other roles keep their places. Same slots when the role is not there. */
export function removeFromCompare(slots: CompareSlots, id: string): CompareSlots {
  return slots.includes(id) ? slots.map((entry) => (entry === id ? null : entry)) : slots;
}

/**
 * Read a stored tray, keeping each role in its slot. Ids that fail `isValid`
 * and repeats become empty slots. Also reads the older format, a plain list
 * of ids, as slots from the first one on.
 */
export function parseCompareSlots(value: unknown, isValid: (id: string) => boolean): CompareSlots {
  if (!Array.isArray(value)) return EMPTY_COMPARE_SLOTS;
  const slots: (string | null)[] = [...EMPTY_COMPARE_SLOTS];
  value.slice(0, COMPARE_MAX).forEach((id, index) => {
    if (typeof id === "string" && isValid(id) && !slots.includes(id)) slots[index] = id;
  });
  return slots;
}

export function sameSlots(a: CompareSlots, b: CompareSlots): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

// ---------------------------------------------------------------------------
// What the tray says
// ---------------------------------------------------------------------------

export type CompareNotice = { tone: "info" | "warning"; text: string };

function subjectOf(id: string, catalog: Pick<CompareCatalog, "describe">): string {
  const role = catalog.describe(id);
  return role ? `${role.title} at ${role.company}` : "That job";
}

function titleOf(id: string, catalog: Pick<CompareCatalog, "describe">): string {
  return catalog.describe(id)?.title ?? "A role";
}

/** "Staff Frontend Engineer moves over" / "2 roles move over". */
function makeRoom(
  shifted: readonly string[],
  tense: "moves" | "moved",
  catalog: Pick<CompareCatalog, "describe">
): string {
  if (shifted.length === 0) return "";
  const who = shifted.length === 1 ? titleOf(shifted[0], catalog) : `${shifted.length} roles`;
  if (tense === "moved") return ` ${who} moved over to make room.`;
  return `; ${who} ${shifted.length === 1 ? "moves" : "move"} over`;
}

/** What the tray says after a role is placed, refused, or removed. */
export function compareNotice(
  placement:
    | Pick<ComparePlacement, "outcome" | "slot" | "shifted" | "slots">
    | { outcome: "removed"; slots: CompareSlots },
  id: string,
  catalog: Pick<CompareCatalog, "describe">
): CompareNotice {
  const subject = subjectOf(id, catalog);
  const count = filledIds(placement.slots).length;
  const ready =
    count >= COMPARE_MIN
      ? ` ${count} of ${COMPARE_MAX} roles ready to compare.`
      : " Add one more role to compare.";
  switch (placement.outcome) {
    case "added":
      return {
        tone: "info",
        text: `Added ${subject} to slot ${placement.slot! + 1}.${makeRoom(placement.shifted, "moved", catalog)}${ready}`,
      };
    case "moved":
      return {
        tone: "info",
        text: `Moved ${subject} to slot ${placement.slot! + 1}.${makeRoom(placement.shifted, "moved", catalog)}`,
      };
    case "removed":
      return { tone: "info", text: `Removed ${subject} from compare.` };
    case "duplicate":
      return {
        tone: "warning",
        text:
          placement.slot === null
            ? `${subject} is already in compare.`
            : `${subject} is already in slot ${placement.slot + 1}.`,
      };
    case "full":
      return {
        tone: "warning",
        text: `Compare holds up to ${COMPARE_MAX} roles. Remove one to add ${subject}.`,
      };
    case "unknown":
      return { tone: "warning", text: "This job cannot be compared." };
  }
}

export type CompareDropPreview = CompareNotice & {
  /** Whether letting go here would place the role. */
  accept: boolean;
};

/**
 * What letting go would do, shown while a role is dragged over the tray.
 * `target` is the slot under the pointer, or undefined between slots.
 */
export function compareDropPreview(
  slots: CompareSlots,
  id: string,
  target: number | undefined,
  catalog: CompareCatalog
): CompareDropPreview {
  const placement = placeInCompare(slots, id, target, catalog);
  switch (placement.outcome) {
    case "added":
      return target === undefined
        ? { tone: "info", accept: true, text: "Drop on a slot to choose its place." }
        : {
            tone: "info",
            accept: true,
            text: `Drop into slot ${placement.slot! + 1}${makeRoom(placement.shifted, "moves", catalog)}.`,
          };
    case "moved":
      return {
        tone: "info",
        accept: true,
        text: `Drop to move it to slot ${placement.slot! + 1}${makeRoom(placement.shifted, "moves", catalog)}.`,
      };
    case "duplicate":
      return {
        tone: "warning",
        accept: false,
        text:
          target === undefined
            ? "Already in compare. Drop it on another slot to move it."
            : "It is already in this slot.",
      };
    case "full":
      return { tone: "warning", accept: false, text: "Compare is full. Remove a role to add another." };
    case "unknown":
      return { tone: "warning", accept: false, text: "This job cannot be compared." };
  }
}
