/** localStorage key for the demo state (see src/app/demo/demo-store.ts). */
export const DEMO_STORAGE_KEY = "jsa:demo-state:v1";

/**
 * sessionStorage key for the live jobs batch (see src/app/demo/demo-live-store.ts).
 * Session storage is per tab: live jobs survive reloads and demo navigation in
 * the tab that loaded them, and are gone in new tabs and once the tab closes.
 */
export const DEMO_LIVE_SESSION_KEY = "jsa:demo-live:v1";

/**
 * sessionStorage key for the roles in the feed's compare tray (see
 * src/app/demo/demo-compare-store.ts). Per tab, like live jobs: the tray
 * survives opening a job and coming back, and is not a change Reset undoes.
 */
export const DEMO_COMPARE_SESSION_KEY = "jsa:demo-compare:v1";

/**
 * localStorage key for the visitor's ranked priorities used to score compared
 * roles (see src/app/demo/demo-priorities-store.ts). A preference rather than
 * demo data, so it outlasts the tab and Reset leaves it alone.
 */
export const DEMO_PRIORITIES_KEY = "jsa:demo-priorities:v1";

/**
 * Set to "1" while the visitor has changes in the demo, removed otherwise.
 * Derived from the demo state and kept in sync by the demo store. It exists so
 * the landing page can pick the right call to action before React loads.
 */
export const DEMO_ACTIVE_KEY = "jsa:demo-active:v1";

/** Attribute the landing page's pre-paint script sets on the CTA wrapper. */
export const DEMO_ACTIVE_ATTRIBUTE = "data-demo";

/**
 * Inline script for the landing page. Runs while the HTML is parsed, before the
 * call to action is painted, so returning visitors never see the wrong copy.
 */
export function demoActivePrePaintScript(): string {
  const key = JSON.stringify(DEMO_ACTIVE_KEY);
  const attribute = JSON.stringify(DEMO_ACTIVE_ATTRIBUTE);
  return `try{if(localStorage.getItem(${key})==="1")document.currentScript.parentElement.setAttribute(${attribute},"active")}catch(e){}`;
}
