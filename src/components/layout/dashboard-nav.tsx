import Link from "next/link";
import { Briefcase, FileText, LayoutDashboard, Settings, User } from "lucide-react";

const navItems = [
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/resumes", label: "Resumes", icon: FileText },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DashboardNav({ currentPath }: { currentPath: string }) {
  return (
    <nav className="flex flex-col gap-1 p-4">
      <div className="mb-6 px-2">
        <h1 className="text-sm font-semibold">Job Search Assistant</h1>
        <p className="text-xs text-muted-foreground">Private-first matching</p>
      </div>
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = currentPath.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
