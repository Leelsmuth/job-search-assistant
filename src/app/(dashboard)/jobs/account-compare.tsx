"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CompareProvider, type CompareAdapter } from "@/components/compare/compare-context";
import type { AccountCompareState } from "@/modules/compare/compare-db";
import {
  SUGGESTED_PRIORITY_ORDER,
  movePriority as movePriorityIn,
  sameOrder,
  type PriorityId,
} from "@/modules/compare/priorities";
import type { CompareRole, CompareRoleSummary } from "@/modules/compare/role";
import {
  EMPTY_COMPARE_SLOTS,
  compareNotice,
  filledIds,
  placeInCompare,
  removeFromCompare,
  sameSlots,
  type CompareCatalog,
  type CompareNotice,
  type CompareSlots,
} from "@/modules/compare/slots";
import {
  saveComparePriorities,
  saveCompareTray,
  type ComparePrioritiesResult,
  type CompareSaveFailure,
  type CompareTrayResult,
} from "@/server/actions/compare-actions";

/** How the provider saves. The real server actions by default; tests pass their own. */
export type CompareActions = {
  saveTray: (slots: (string | null)[]) => Promise<CompareTrayResult>;
  savePriorities: (order: PriorityId[]) => Promise<ComparePrioritiesResult>;
};

const SERVER_ACTIONS: CompareActions = {
  saveTray: saveCompareTray,
  savePriorities: saveComparePriorities,
};

const NOT_SET_UP =
  "Comparing is not set up on this database yet (migration 0025), so nothing is saved after you reload.";

const SAVE_FAILED: Record<CompareSaveFailure["reason"], { tray: string; priorities: string }> = {
  unavailable: { tray: NOT_SET_UP, priorities: NOT_SET_UP },
  failed: {
    tray: "Could not save your compare tray, so it is back to how it was. Check your connection and try again.",
    priorities:
      "Could not save to your account, so this order lasts until you reload. Check your connection and try again.",
  },
};

type Notice = (CompareNotice & { key: number }) | null;

/** Server actions can also fail in transit (offline, deploy in progress). */
async function attempt<T>(save: () => Promise<T | CompareSaveFailure>): Promise<T | CompareSaveFailure> {
  try {
    return await save();
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Backs the shared compare tray, comparison, and priority ranker with the
 * signed-in user's account. Changes show at once and save in the background,
 * one at a time; only the latest answer from the server is applied. A failed
 * tray save puts the tray back as it was last saved and says so. A failed
 * priority save keeps the new order for this page and says it is not saved.
 *
 * `feed` is the jobs on the page, so they can be dragged in before the server
 * has sent their full details.
 */
export function AccountCompareProvider({
  initial,
  feed,
  actions = SERVER_ACTIONS,
  children,
}: {
  initial: AccountCompareState;
  feed: CompareRoleSummary[];
  actions?: CompareActions;
  children: React.ReactNode;
}) {
  const [slots, setSlots] = useState<CompareSlots>(initial.slots);
  const [roles, setRoles] = useState<ReadonlyMap<string, CompareRole>>(
    () => new Map(initial.roles.map((role) => [role.id, role]))
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [priorities, setPriorities] = useState<CompareAdapter["priorities"]>({
    order: initial.priorities.order,
    // Without the migration nothing can be saved; say so up front rather than promise it.
    save: !initial.available ? "unsaved" : initial.priorities.saved ? "saved" : "default",
    savedAt: null,
  });
  const [priorityFailure, setPriorityFailure] = useState<CompareSaveFailure["reason"]>(
    initial.available ? "failed" : "unavailable"
  );

  // The latest values, for actions that run after an await.
  const slotsRef = useRef(slots);
  const confirmedSlots = useRef(initial.slots);
  const orderRef = useRef(priorities.order);
  const trayRequest = useRef(0);
  const priorityRequest = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const noticeKey = useRef(0);
  const toldNotSetUp = useRef(false);

  const say = useCallback((next: CompareNotice) => {
    noticeKey.current += 1;
    setNotice({ ...next, key: noticeKey.current });
  }, []);

  /** Saves run one after another, in the order they were made. */
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const summaries = useMemo(() => {
    const map = new Map<string, CompareRoleSummary>(feed.map((job) => [job.id, job]));
    for (const role of roles.values()) {
      map.set(role.id, { id: role.id, title: role.title, company: role.company, fitScore: role.fitScore });
    }
    return map;
  }, [feed, roles]);

  const catalog = useMemo(
    (): CompareCatalog => ({
      isKnown: (id) => summaries.has(id),
      describe: (id) => summaries.get(id) ?? null,
    }),
    [summaries]
  );

  const saveTray = useCallback(
    (next: CompareSlots) => {
      if (!initial.available) {
        // Once per page: the tray works, but will be gone after a reload.
        if (!toldNotSetUp.current) {
          toldNotSetUp.current = true;
          say({ tone: "warning", text: NOT_SET_UP });
        }
        return;
      }
      const request = ++trayRequest.current;
      void enqueue(async () => {
        const result = await attempt(() => actions.saveTray([...next]));
        if (result.ok) {
          setRoles((current) => {
            const merged = new Map(current);
            for (const role of result.roles) merged.set(role.id, role);
            return merged;
          });
          confirmedSlots.current = result.slots;
        }
        // A newer change is on its way; its answer decides what the tray shows.
        if (request !== trayRequest.current) return;
        if (!result.ok) {
          slotsRef.current = confirmedSlots.current;
          setSlots(confirmedSlots.current);
          say({ tone: "warning", text: SAVE_FAILED[result.reason].tray });
          return;
        }
        // The server keeps only the user's own jobs; show what it actually saved.
        if (!sameSlots(result.slots, slotsRef.current)) {
          slotsRef.current = result.slots;
          setSlots(result.slots);
        }
      });
    },
    [actions, enqueue, initial.available, say]
  );

  const change = useCallback(
    (next: CompareSlots, message: CompareNotice) => {
      say(message);
      if (next === slotsRef.current) return;
      slotsRef.current = next;
      setSlots(next);
      // After the message above, so a failure to save is what the tray ends up saying.
      saveTray(next);
    },
    [saveTray, say]
  );

  const savePriorities = useCallback(
    (order: readonly PriorityId[]) => {
      if (sameOrder(order, orderRef.current)) return;
      orderRef.current = order;
      if (!initial.available) {
        setPriorityFailure("unavailable");
        setPriorities({ order, save: "unsaved", savedAt: null });
        return;
      }
      setPriorities((current) => ({ ...current, order, save: "saving" }));
      const request = ++priorityRequest.current;
      void enqueue(async () => {
        const result = await attempt(() => actions.savePriorities([...order]));
        if (request !== priorityRequest.current) return;
        if (result.ok) {
          setPriorities({ order: orderRef.current, save: "saved", savedAt: Date.now() });
        } else {
          setPriorityFailure(result.reason);
          setPriorities({ order: orderRef.current, save: "unsaved", savedAt: null });
        }
      });
    },
    [actions, enqueue, initial.available]
  );

  const adapter = useMemo((): CompareAdapter => {
    const filled = filledIds(slots);
    const loaded = filled.map((id) => roles.get(id));
    return {
      slots,
      draggingId,
      notice,
      catalog,
      summary: (id) => summaries.get(id) ?? null,
      // Until the server has sent every role's details, the comparison shows it is loading.
      roles: loaded.every((role): role is CompareRole => role !== undefined) ? loaded : null,
      place: (id, slot) => {
        const placement = placeInCompare(slotsRef.current, id, slot, catalog);
        change(placement.slots, compareNotice(placement, id, catalog));
      },
      remove: (id) => {
        const next = removeFromCompare(slotsRef.current, id);
        if (next === slotsRef.current) return;
        change(next, compareNotice({ outcome: "removed", slots: next }, id, catalog));
      },
      clear: () => {
        if (filledIds(slotsRef.current).length === 0) return;
        change(EMPTY_COMPARE_SLOTS, { tone: "info", text: "Compare cleared." });
      },
      startDrag: setDraggingId,
      endDrag: () => setDraggingId(null),
      priorities,
      movePriority: (id, toIndex) => savePriorities(movePriorityIn(orderRef.current, id, toIndex)),
      resetPriorities: () => savePriorities(SUGGESTED_PRIORITY_ORDER),
      copy: {
        savedWhere: "to your account",
        saveFailed: SAVE_FAILED[priorityFailure].priorities,
        skillsNote: "Ticked skills are on your profile",
      },
    };
  }, [slots, roles, draggingId, notice, catalog, summaries, priorities, priorityFailure, change, savePriorities]);

  return <CompareProvider adapter={adapter}>{children}</CompareProvider>;
}
