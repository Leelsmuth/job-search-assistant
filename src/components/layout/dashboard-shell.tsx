"use client";

import { usePathname } from "next/navigation";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { ToasterProvider } from "@/components/ui/use-toast";

export function DashboardShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email?: string | null;
}) {
  const pathname = usePathname();

  return (
    <ToasterProvider>
      <div className="flex min-h-screen">
        <aside className="flex w-56 flex-col border-r border-border bg-card">
          <DashboardNav currentPath={pathname} />
          {email && (
            <div className="mt-auto border-t border-border p-4">
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
          )}
        </aside>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </ToasterProvider>
  );
}
