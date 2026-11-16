/** localStorage key for the demo state (see src/app/demo/demo-store.ts). */
export const DEMO_STORAGE_KEY = "jsa:demo-state:v1";

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
