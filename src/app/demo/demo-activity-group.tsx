"use client";

import { useDemoInProgress } from "./demo-activity";

/**
 * Wrapper that tells CSS whether the visitor has a demo in progress, through a
 * data-demo="active" attribute read by `group-data-[demo=active]:` classes.
 *
 * On a full page load the inline script passed as the first child sets the
 * attribute before paint; React leaves it in place during hydration
 * (suppressHydrationWarning) and keeps it current afterwards, including on
 * client-side navigation where inline scripts do not run.
 *
 * Keep this component tiny: it is the only demo code the landing page ships.
 */
export function DemoActivityGroup({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const inProgress = useDemoInProgress();
  return (
    <div
      className={className}
      data-demo={inProgress ? "active" : undefined}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}
