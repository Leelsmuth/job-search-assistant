"use client";

import type { CompareRoleSummary } from "@/modules/compare/role";
import { COMPARE_DRAG_TYPE } from "@/modules/compare/slots";
import type { CompareAdapter } from "./compare-context";

/** Where the pointer holds the drag preview: on the fit score, so the chip trails to the right. */
const PREVIEW_GRAB_X = 22;

/**
 * A compact stand-in for the card while it is dragged, shaped like a tray
 * slot, so what you carry looks like what lands in the tray and does not
 * cover it. Built from text nodes only: job titles are data, never markup.
 *
 * The browser snapshots it right after dragstart, so it must be in the
 * document and laid out; it sits in the viewport (Safari skips off-screen
 * previews) under the page content, and is removed once the drag has begun.
 */
function dragPreview(role: CompareRoleSummary): HTMLElement {
  const chip = document.createElement("div");
  chip.setAttribute("aria-hidden", "true");
  chip.dataset.compareDragPreview = role.id;
  chip.className =
    "pointer-events-none fixed left-0 top-0 -z-10 flex w-60 items-center gap-2 rounded-lg border-2 border-primary bg-card px-2 py-1.5 text-card-foreground";

  const fit = document.createElement("span");
  fit.className = "w-8 shrink-0 text-center";
  const score = document.createElement("span");
  score.className = "block text-base font-bold leading-none";
  score.textContent = role.fitScore === null ? "—" : String(role.fitScore);
  const label = document.createElement("span");
  label.className = "text-[10px] text-muted-foreground";
  label.textContent = "fit";
  fit.append(score, label);

  const text = document.createElement("span");
  text.className = "min-w-0 flex-1";
  const title = document.createElement("span");
  title.className = "block truncate text-[13px] font-medium leading-tight";
  title.textContent = role.title;
  const company = document.createElement("span");
  company.className = "block truncate text-xs text-muted-foreground";
  company.textContent = role.company;
  text.append(title, company);

  chip.append(fit, text);
  return chip;
}

/**
 * Props that make a feed row (or a tray slot) draggable into the compare
 * tray. Each row's Compare button does the same thing for keyboard and touch
 * users.
 */
export function compareDragProps(role: CompareRoleSummary, compare: CompareAdapter) {
  return {
    draggable: true,
    onDragStart(event: React.DragEvent<HTMLElement>) {
      event.dataTransfer.setData(COMPARE_DRAG_TYPE, role.id);
      // Keep "link" so the job link can still be dropped into a new browser tab.
      event.dataTransfer.effectAllowed = "copyLink";
      // Carry a small chip rather than the full-width card (or, when the drag
      // starts on the job link, a bare URL).
      const preview = dragPreview(role);
      document.body.append(preview);
      const height = preview.getBoundingClientRect().height;
      event.dataTransfer.setDragImage(preview, PREVIEW_GRAB_X, height / 2);
      window.setTimeout(() => preview.remove(), 0);
      compare.startDrag(role.id);
    },
    onDragEnd() {
      compare.endDrag();
    },
  };
}

export function hasCompareRole(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(COMPARE_DRAG_TYPE);
}

export function draggedRoleId(event: React.DragEvent): string {
  return event.dataTransfer.getData(COMPARE_DRAG_TYPE);
}
