"use client";

import { useEffect, useState } from "react";
import { Columns3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompareRoleSummary } from "@/modules/compare/role";
import {
  COMPARE_MAX,
  COMPARE_MIN,
  canCompare,
  compareDropPreview,
  compareRejection,
  filledIds,
} from "@/modules/compare/slots";
import { useCompare, type CompareAdapter } from "./compare-context";
import { compareDragProps, draggedRoleId, hasCompareRole } from "./compare-drag";
import { CompareDialog } from "./compare-dialog";
import { PrioritiesDialog } from "./priorities";

/** How long an "Added…" or "Removed…" message stays before the tray shows its usual hint. */
const NOTICE_MS = 6000;

/** The tray slot under the pointer, or undefined between or outside the slots. */
function slotUnder(event: React.DragEvent): number | undefined {
  const slot = (event.target as Element | null)?.closest?.("[data-slot]")?.getAttribute("data-slot");
  return slot == null ? undefined : Number(slot);
}

/**
 * The compare tray, docked to the bottom of the feed. Roles are dragged into
 * it (or added with a row's Compare button); with two to four roles in it,
 * Compare opens them side by side.
 *
 * `className` positions it: the demo spans the window, the signed-in app
 * starts after its sidebar.
 */
export function CompareTray({ className = "inset-x-0" }: { className?: string }) {
  const compare = useCompare();
  const [over, setOver] = useState(false);
  const [overSlot, setOverSlot] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [expiredNotice, setExpiredNotice] = useState<number | null>(null);
  const notice = compare?.notice ?? null;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setExpiredNotice(notice.key), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!compare) return null;

  const { slots, draggingId, catalog } = compare;
  const count = filledIds(slots).length;
  // A role already in the tray can always be moved to another slot.
  const placeable =
    draggingId !== null &&
    (slots.includes(draggingId) || compareRejection(slots, draggingId, undefined, catalog) === null);
  const hoveredSlot = draggingId !== null && over ? overSlot : null;
  const preview = draggingId
    ? compareDropPreview(slots, draggingId, hoveredSlot ?? undefined, catalog)
    : null;
  const ready = canCompare(slots);
  const empty = count === 0;

  let status: { text: string; tone: "info" | "warning" };
  if (preview) {
    status = preview;
  } else if (notice && notice.key !== expiredNotice) {
    status = notice;
  } else {
    status = { tone: "info", text: idleHint(count) };
  }

  function onDragOver(event: React.DragEvent) {
    if (!hasCompareRole(event)) return;
    // Take the drop even when the tray cannot hold the role, so letting go
    // always gets an answer ("already in compare", "compare is full").
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setOver(true);
    setOverSlot(slotUnder(event) ?? null);
  }

  function onDragLeave(event: React.DragEvent) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOver(false);
    setOverSlot(null);
  }

  function onDrop(event: React.DragEvent) {
    if (!hasCompareRole(event) || !compare) return;
    event.preventDefault();
    setOver(false);
    setOverSlot(null);
    const id = draggedRoleId(event);
    // The slot it was dropped on; between slots, the first empty one.
    if (id) compare.place(id, slotUnder(event));
    compare.endDrag();
  }

  const firstEmpty = slots.indexOf(null);

  return (
    <>
      {/* Room at the end of the feed, so the docked tray never covers the last job. */}
      <div aria-hidden="true" className={cn("h-36 sm:h-32", empty && "hidden sm:block")} />
      <section
        aria-labelledby="compare-heading"
        data-testid="compare-tray"
        data-drop-state={
          draggingId === null ? "idle" : !placeable ? "refused" : over ? "over" : "ready"
        }
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "fixed bottom-0 z-20 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur transition-colors supports-[backdrop-filter]:bg-card/85",
          className,
          // Phones cannot drag, so an empty tray would only take up room there.
          empty && "hidden sm:block",
          placeable && "border-t-2 border-primary",
          placeable && over && "bg-primary/10 supports-[backdrop-filter]:bg-primary/10",
          draggingId !== null && !placeable && "border-t-2 border-amber-500"
        )}
      >
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-2.5">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
              <h2
                id="compare-heading"
                className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold"
              >
                <Columns3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Compare roles
                <span className="rounded-full bg-muted px-1.5 text-xs font-medium">
                  {count} of {COMPARE_MAX}
                </span>
              </h2>
              <p
                role="status"
                className={cn(
                  // One line on phones, so the tray stays short; the full text is still read out.
                  "mt-0.5 truncate text-xs sm:mt-0 sm:whitespace-normal",
                  status.tone === "warning" ? "font-medium text-amber-800" : "text-muted-foreground"
                )}
              >
                {status.text}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <PrioritiesDialog compareCount={ready ? count : 0} onCompare={() => setOpen(true)} />
              {!empty ? (
                <Button variant="ghost" size="sm" className="min-h-10" onClick={() => compare.clear()}>
                  Clear
                </Button>
              ) : null}
              <CompareDialog
                open={open && ready}
                onOpenChange={setOpen}
                trigger={
                  <Button size="sm" className="min-h-10" disabled={!ready}>
                    {ready ? (
                      <>
                        <span className="sm:hidden">Compare ({count})</span>
                        <span className="hidden sm:inline">Compare {count} roles</span>
                      </>
                    ) : (
                      "Compare"
                    )}
                  </Button>
                }
              />
            </div>
          </div>

          <ol
            aria-label="Roles to compare"
            className="flex gap-2 overflow-x-auto sm:grid sm:grid-cols-4 sm:overflow-visible"
          >
            {slots.map((id, index) => {
              const hovered = hoveredSlot === index;
              const target = hovered ? (preview?.accept ? "accept" : "refuse") : null;
              if (id) {
                return (
                  <TraySlot
                    key={id}
                    role={compare.summary(id) ?? { id, title: "Unavailable job", company: "", fitScore: null }}
                    index={index}
                    target={target}
                    dragging={draggingId === id}
                    compare={compare}
                  />
                );
              }
              return (
                <li
                  key={`empty-${index}`}
                  data-slot={index}
                  aria-hidden="true"
                  className={cn(
                    "hidden min-h-14 items-center justify-center rounded-md border-2 border-dashed px-2 text-center text-xs text-muted-foreground transition-colors sm:flex",
                    placeable ? "border-primary/40" : "border-border",
                    target === "accept" && "border-primary bg-primary/5 font-medium text-foreground",
                    target === "refuse" && "border-amber-500"
                  )}
                >
                  {draggingId !== null
                    ? hovered
                      ? "Drop here"
                      : `Slot ${index + 1}`
                    : index === firstEmpty
                      ? "Drag a job here"
                      : null}
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </>
  );
}

function idleHint(count: number): string {
  if (count === 0) {
    return `Drag jobs here, or use Compare on a job. Compare ${COMPARE_MIN} to ${COMPARE_MAX} roles.`;
  }
  if (count < COMPARE_MIN) return "Add one more role to compare.";
  if (count < COMPARE_MAX) {
    const left = COMPARE_MAX - count;
    return `Ready to compare. Room for ${left} more role${left === 1 ? "" : "s"}.`;
  }
  return "Compare is full. Remove a role to add another.";
}

/**
 * A filled slot. Drag it onto another slot to move it there; a role dropped
 * on it takes its place and it shifts over to make room.
 */
function TraySlot({
  role,
  index,
  target,
  dragging,
  compare,
}: {
  role: CompareRoleSummary;
  index: number;
  /** Set while a role is dragged over this slot: whether letting go would place it here. */
  target: "accept" | "refuse" | null;
  dragging: boolean;
  compare: CompareAdapter;
}) {
  const subject = role.company ? `${role.title} at ${role.company}` : role.title;
  const fit = role.fitScore === null ? "—" : String(role.fitScore);
  return (
    <li
      {...compareDragProps(role, compare)}
      data-slot={index}
      title="Drag to another slot to move it"
      className={cn(
        "flex min-h-14 min-w-[13rem] items-center gap-2 rounded-md border border-border bg-background py-1 pl-2 transition-colors sm:min-w-0 sm:cursor-grab",
        target === "accept" && "border-primary ring-2 ring-primary",
        target === "refuse" && "ring-2 ring-amber-500",
        dragging && "opacity-50"
      )}
    >
      <span
        className="w-8 shrink-0 text-center"
        aria-label={role.fitScore === null ? "No fit score" : `Fit ${role.fitScore}`}
      >
        <span className="block text-base font-bold leading-none" aria-hidden="true">
          {fit}
        </span>
        <span className="text-[10px] text-muted-foreground" aria-hidden="true">
          fit
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-medium leading-tight" title={role.title}>
          {role.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">{role.company}</p>
      </div>
      <button
        type="button"
        aria-label={`Remove ${subject} from compare`}
        className="inline-flex h-10 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => compare.remove(role.id)}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}
