"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { ActionPendingProvider } from "@/components/layout/action-pending-provider";
import { ToasterProvider } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DashboardShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email?: string | null;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  return (
    <ToasterProvider>
      <ActionPendingProvider>
        <div className="flex min-h-screen flex-col lg:flex-row">
          {/* Desktop sidebar */}
          <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card lg:flex">
            <DashboardNav />
            {email && (
              <div className="mt-auto border-t border-border p-4">
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
            )}
          </aside>

          {/* Mobile drawer */}
          {mobileNavOpen ? (
            <button
              type="button"
              aria-label="Close navigation menu"
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
          ) : null}
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex w-[min(100vw-3rem,18rem)] flex-col border-r border-border bg-card shadow-xl transition-transform duration-200 lg:hidden",
              mobileNavOpen ? "translate-x-0" : "-translate-x-full"
            )}
            aria-hidden={!mobileNavOpen}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <p className="text-sm font-semibold">Job Search Assistant</p>
                <p className="text-xs text-muted-foreground">Private-first matching</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 shrink-0 px-0"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DashboardNav onNavigate={() => setMobileNavOpen(false)} compact />
            </div>
            {email ? (
              <div className="border-t border-border p-4">
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
            ) : null}
          </aside>

          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 w-10 shrink-0 px-0"
                aria-label="Open navigation menu"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Job Search Assistant</p>
                {email ? (
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                ) : null}
              </div>
            </header>

            <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
              {children}
            </main>
          </div>
        </div>
      </ActionPendingProvider>
    </ToasterProvider>
  );
}
