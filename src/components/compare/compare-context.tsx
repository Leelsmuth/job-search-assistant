"use client";

import { createContext, useContext } from "react";
import type { CompareRole, CompareRoleSummary } from "@/modules/compare/role";
import type { PriorityId } from "@/modules/compare/priorities";
import type { CompareCatalog, CompareNotice, CompareSlots } from "@/modules/compare/slots";

/**
 * Whether the person's priority order is saved:
 * - "default": nothing saved yet; the suggested order is in use.
 * - "saving": a change is on its way (account only).
 * - "saved": it will be there next time.
 * - "unsaved": saving failed, so the order lasts until the page is reloaded.
 */
export type PrioritiesSaveStatus = "default" | "saving" | "saved" | "unsaved";

/**
 * Everything the compare tray, the comparison, and the priority ranker need.
 * The demo backs it with browser storage (src/app/demo/demo-compare-adapter.tsx);
 * the signed-in feed backs it with the account (src/app/(dashboard)/jobs/compare).
 * Same idea as TrackerAdapterProvider for the tracker.
 */
export type CompareAdapter = {
  slots: CompareSlots;
  /** The role being dragged, so the tray can show where to drop it. */
  draggingId: string | null;
  /** Latest message for the tray. `key` changes each time, so repeats are announced. */
  notice: (CompareNotice & { key: number }) | null;
  catalog: CompareCatalog;
  /** What a tray slot and the drag preview show. Null for a role we know nothing about. */
  summary: (id: string) => CompareRoleSummary | null;
  /** The roles in the tray, in slot order, for the comparison. Null while they load. */
  roles: CompareRole[] | null;
  /** Put a role in the tray: in `slot` when dropped on one, else the first empty slot. */
  place: (id: string, slot?: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  startDrag: (id: string) => void;
  endDrag: () => void;

  priorities: {
    order: readonly PriorityId[];
    save: PrioritiesSaveStatus;
    /** When this page last saved a change (ms since epoch), for a brief "Saved just now". */
    savedAt: number | null;
  };
  movePriority: (id: PriorityId, toIndex: number) => void;
  resetPriorities: () => void;

  copy: {
    /** Where priorities are kept: "in this browser", "to your account". */
    savedWhere: string;
    /** Shown, and announced, when saving priorities failed. */
    saveFailed: string;
    /** Under the tech stack row: whose skills the ticks stand for. */
    skillsNote: string;
  };
};

const CompareContext = createContext<CompareAdapter | null>(null);

export function CompareProvider({
  adapter,
  children,
}: {
  adapter: CompareAdapter | null;
  children: React.ReactNode;
}) {
  return <CompareContext.Provider value={adapter}>{children}</CompareContext.Provider>;
}

/** Null outside a provider and while the provider is still loading (server render, hydration). */
export function useCompare(): CompareAdapter | null {
  return useContext(CompareContext);
}

export function toggleCompare(compare: CompareAdapter, id: string) {
  if (compare.slots.includes(id)) compare.remove(id);
  else compare.place(id);
}
