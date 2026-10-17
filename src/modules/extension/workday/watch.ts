import { detectWorkdayStep, workdayControlCount } from "@/modules/extension/workday/detect";
import { workdayRequisitionKey } from "@/modules/extension/workday/session";
import type { DetectedWorkdayStep } from "@/modules/extension/workday/types";

type HistoryWriter = History["pushState"];

/**
 * Debounced MutationObserver plus history hooks. Workday is a single-page
 * wizard: the step title and fields change without a navigation the browser
 * treats as a new document, and the URL often stays the same.
 */
export function watchWorkdayPage(
  doc: Document,
  onStep: (step: DetectedWorkdayStep) => void,
  options?: { debounceMs?: number }
): () => void {
  const debounceMs = options?.debounceMs ?? 400;
  const view = doc.defaultView;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = "";
  let stopped = false;

  const emit = () => {
    timer = null;
    if (stopped) return;
    const href = doc.defaultView?.location?.href ?? "";
    const step = detectWorkdayStep(doc);
    const signature = `${workdayRequisitionKey(href)}|${step.id}|${workdayControlCount(doc)}`;
    if (signature === last) return;
    last = signature;
    onStep(step);
  };

  const schedule = () => {
    if (stopped) return;
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(emit, debounceMs);
  };

  const root = doc.body ?? doc.documentElement;
  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-current", "data-automation-id", "hidden", "aria-hidden"],
  });

  const unpatch = view ? patchHistory(view, schedule) : () => undefined;
  view?.addEventListener("popstate", schedule);
  view?.addEventListener("hashchange", schedule);
  schedule();

  return () => {
    stopped = true;
    if (timer != null) clearTimeout(timer);
    observer.disconnect();
    unpatch();
    view?.removeEventListener("popstate", schedule);
    view?.removeEventListener("hashchange", schedule);
  };
}

function patchHistory(view: Window, schedule: () => void): () => void {
  const history = view.history;
  const push = history.pushState;
  const replace = history.replaceState;
  const wrap =
    (original: HistoryWriter): HistoryWriter =>
    function wrapped(this: History, ...args: Parameters<HistoryWriter>) {
      const result = original.apply(this, args);
      schedule();
      return result;
    };
  history.pushState = wrap(push);
  history.replaceState = wrap(replace);
  return () => {
    if (history.pushState !== push) history.pushState = push;
    if (history.replaceState !== replace) history.replaceState = replace;
  };
}
