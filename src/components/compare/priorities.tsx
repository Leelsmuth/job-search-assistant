"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Lightbulb,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PRIORITIES,
  isSuggestedOrder,
  movePriority,
  priorityPoints,
  priorityTip,
  type PriorityId,
} from "@/modules/compare/priorities";
import { useCompare, type CompareAdapter } from "./compare-context";

/** How long "Saved just now" shows after a change. */
const JUST_SAVED_MS = 2500;

/** Pointer travel before a press becomes a drag, so a click never reorders. */
const DRAG_THRESHOLD_PX = 4;

type DragState = {
  id: PriorityId;
  pointerId: number;
  from: number;
  over: number;
  startY: number;
  deltaY: number;
  /** Item boxes when the drag started, in list order. */
  rects: DOMRect[];
};

function ordinalPoints(points: number): string {
  return `${points} ${points === 1 ? "pt" : "pts"}`;
}

/**
 * Ranked list of priorities. Drag an item (mouse anywhere on it, touch on the
 * grip) to reorder it; the rank numbers and points preview the new order while
 * dragging. Pointer events rather than HTML drag and drop, so it also works on
 * phones. The arrow buttons do the same for keyboard users.
 */
export function PriorityRanker({
  order,
  onMove,
  showDescriptions = true,
}: {
  order: readonly PriorityId[];
  onMove: (id: PriorityId, toIndex: number) => void;
  showDescriptions?: boolean;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dragging = drag !== null && Math.abs(drag.deltaY) >= DRAG_THRESHOLD_PX;
  const preview = drag && dragging ? movePriority(order, drag.id, drag.over) : order;

  function commit(id: PriorityId, toIndex: number) {
    onMove(id, toIndex);
    const points = order.length - toIndex;
    setAnnouncement(`${PRIORITIES[id].label} moved to #${toIndex + 1}, worth ${ordinalPoints(points)}.`);
  }

  /**
   * Arrow button moves. At the top or bottom the pressed arrow is disabled,
   * which would drop keyboard focus, so hand it to the item's other arrow.
   */
  function step(id: PriorityId, toIndex: number) {
    commit(id, toIndex);
    const atEnd = toIndex === 0 ? "down" : toIndex === order.length - 1 ? "up" : null;
    if (!atEnd) return;
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-priority="${id}"] [data-move="${atEnd}"]`)
        ?.focus();
    });
  }

  function onPointerDown(event: React.PointerEvent<HTMLLIElement>, id: PriorityId, index: number) {
    if (event.button !== 0 || !listRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    // On touch screens only the grip drags, so the rest of the list still scrolls.
    if (event.pointerType !== "mouse" && !target.closest("[data-drag-handle]")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const items = Array.from(listRef.current.children) as HTMLElement[];
    setDrag({
      id,
      pointerId: event.pointerId,
      from: index,
      over: index,
      startY: event.clientY,
      deltaY: 0,
      rects: items.map((item) => item.getBoundingClientRect()),
    });
  }

  function onPointerMove(event: React.PointerEvent<HTMLLIElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const box = drag.rects[drag.from];
    const first = drag.rects[0];
    const last = drag.rects[drag.rects.length - 1];
    // Keep the item inside the list.
    const deltaY = Math.max(
      first.top - box.top,
      Math.min(last.bottom - box.bottom, event.clientY - drag.startY)
    );
    const center = box.top + box.height / 2 + deltaY;
    const over = drag.rects.filter(
      (rect, index) => index !== drag.from && rect.top + rect.height / 2 < center
    ).length;
    setDrag({ ...drag, deltaY, over });
  }

  function onPointerEnd(event: React.PointerEvent<HTMLLIElement>, drop: boolean) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drop && dragging && drag.over !== drag.from) commit(drag.id, drag.over);
    setDrag(null);
  }

  /** How far an item slides to make room for the one being dragged. */
  function offset(index: number): number {
    if (!drag || !dragging) return 0;
    if (index === drag.from) return drag.deltaY;
    const { from, over, rects } = drag;
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0;
    const shift = rects[from].height + gap;
    if (from < over && index > from && index <= over) return -shift;
    if (from > over && index >= over && index < from) return shift;
    return 0;
  }

  return (
    <div>
      <ol
        ref={listRef}
        aria-label="Your priorities, most important first"
        className="relative space-y-1.5"
      >
        {order.map((id, index) => {
          const previewIndex = preview.indexOf(id);
          const points = priorityPoints(preview, id);
          const isDragged = drag?.id === id && dragging;
          const { label, description } = PRIORITIES[id];
          return (
            <li
              key={id}
              data-priority={id}
              onPointerDown={(event) => onPointerDown(event, id, index)}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => onPointerEnd(event, true)}
              onPointerCancel={(event) => onPointerEnd(event, false)}
              style={{ transform: `translateY(${offset(index)}px)` }}
              className={cn(
                "relative flex select-none items-center gap-2 rounded-md border border-border bg-background py-1 pl-1 pr-1 md:cursor-grab",
                // Slide smoothly while dragging; no transition on drop, so nothing jumps.
                drag && dragging && !isDragged && "transition-transform duration-150",
                isDragged && "z-10 cursor-grabbing border-primary shadow-lg ring-1 ring-primary"
              )}
            >
              <span
                data-drag-handle
                aria-hidden="true"
                className="flex h-10 w-6 shrink-0 touch-none cursor-grab items-center justify-center text-muted-foreground"
              >
                <GripVertical className="h-4 w-4" />
              </span>
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  previewIndex === 0 ? "bg-primary text-primary-foreground" : "bg-muted"
                )}
              >
                #{previewIndex + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{label}</p>
                {showDescriptions ? (
                  <p className="text-xs leading-snug text-muted-foreground">{description}</p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                {ordinalPoints(points)}
              </span>
              <span className="flex shrink-0">
                <button
                  type="button"
                  aria-label={`Move ${label} up`}
                  disabled={index === 0}
                  data-move="up"
                  onClick={() => step(id, index - 1)}
                  className="inline-flex h-10 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${label} down`}
                  disabled={index === order.length - 1}
                  data-move="down"
                  onClick={() => step(id, index + 1)}
                  className="inline-flex h-10 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** Ranker plus the explanation, the fit tip, and a way back to our suggestion. */
export function PrioritiesPanel({ showDescriptions = true }: { showDescriptions?: boolean }) {
  const compare = useCompare();
  if (!compare) return null;
  const { order } = compare.priorities;
  const tip = priorityTip(order);
  const top = order.length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Drag to rank what matters most to you. #1 is worth {top} points, #{top} is worth 1. Each role
        earns a share of every priority&apos;s points.
      </p>
      <PriorityRanker
        order={order}
        onMove={compare.movePriority}
        showDescriptions={showDescriptions}
      />
      {tip ? (
        <p className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{tip}</span>
        </p>
      ) : null}
      {!isSuggestedOrder(order) ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-10 w-full"
          onClick={() => compare.resetPriorities()}
        >
          Use suggested order (fit first)
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          This is our suggested order: fit first, since roles you fit are the ones you are most
          likely to land.
        </p>
      )}
      <SaveStatus priorities={compare.priorities} copy={compare.copy} />
    </div>
  );
}

/**
 * Tells the person whether their order will be there next time. Only says
 * "Saved" once it actually was: by the browser in the demo, by the server for
 * signed-in users.
 */
function SaveStatus({
  priorities,
  copy,
}: {
  priorities: CompareAdapter["priorities"];
  copy: CompareAdapter["copy"];
}) {
  const { save, savedAt } = priorities;
  // A clock that ticks once, when "Saved just now" should fade back to the usual line.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (savedAt === null) return;
    const remaining = savedAt + JUST_SAVED_MS - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), remaining);
    return () => window.clearTimeout(timer);
  }, [savedAt]);
  const justSaved = savedAt !== null && now - savedAt < JUST_SAVED_MS;

  if (save === "unsaved") {
    // Announced: the person would otherwise expect to find this order next time.
    return (
      <p
        role="alert"
        data-testid="priorities-save-status"
        className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950"
      >
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{copy.saveFailed}</span>
      </p>
    );
  }
  if (save === "default") {
    return (
      <p data-testid="priorities-save-status" className="text-xs text-muted-foreground">
        Any change you make is saved {copy.savedWhere} for next time.
      </p>
    );
  }
  if (save === "saving") {
    return (
      <p data-testid="priorities-save-status" className="text-xs text-muted-foreground">
        Saving…
      </p>
    );
  }
  return (
    <p
      data-testid="priorities-save-status"
      className={cn(
        "flex items-center gap-1.5 text-xs transition-colors",
        justSaved ? "font-medium text-emerald-700" : "text-muted-foreground"
      )}
    >
      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {justSaved
        ? `Saved just now ${copy.savedWhere}.`
        : `Saved ${copy.savedWhere}, so it's here next time.`}
    </p>
  );
}

/**
 * Priorities from the compare tray, before comparing. When enough roles are in
 * the tray, the dialog can go straight on to the comparison.
 */
export function PrioritiesDialog({
  compareCount,
  onCompare,
}: {
  /** Roles ready to compare, or 0 when there are not enough yet. */
  compareCount: number;
  onCompare: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="outline" size="sm" className="min-h-10" aria-label="Your priorities">
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Priorities</span>
          </span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-5 text-card-foreground shadow-lg focus:outline-none">
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </Dialog.Close>
          <Dialog.Title className="pr-8 text-lg font-semibold">Your priorities</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Compared roles are scored on these, and the comparison tells you which role suits you
            best. You can change the order there too.
          </Dialog.Description>
          <div className="mt-4">
            <PrioritiesPanel />
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="outline" className="min-h-10">
                Done
              </Button>
            </Dialog.Close>
            {compareCount > 0 ? (
              <Button
                className="min-h-10"
                onClick={() => {
                  setOpen(false);
                  onCompare();
                }}
              >
                Compare {compareCount} roles
              </Button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
