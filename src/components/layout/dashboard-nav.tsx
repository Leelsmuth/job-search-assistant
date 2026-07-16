"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  FileText,
  LayoutDashboard,
  Settings,
  User,
  ClipboardList,
  PlusCircle,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const navItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase, exact: true },
  { href: "/jobs/import", label: "Import Job", icon: PlusCircle, exact: true },
  { href: "/discovery", label: "Discovery", icon: Radar },
  { href: "/applications", label: "Applications", icon: ClipboardList },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/resumes", label: "Resumes", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isNavActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  if (href === "/jobs") {
    return pathname === "/jobs" || /^\/jobs\/[^/]+$/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav({
  onNavigate,
  compact = false,
  className,
}: {
  onNavigate?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-1 p-4", className)}>
      {!compact ? (
        <div className="mb-6 px-2">
          <h1 className="text-sm font-semibold">Job Search Assistant</h1>
          <p className="text-xs text-muted-foreground">Private-first matching</p>
        </div>
      ) : null}
      {navItems.map(({ href, label, icon: Icon, exact }) => {
        const active = isNavActive(pathname, href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
