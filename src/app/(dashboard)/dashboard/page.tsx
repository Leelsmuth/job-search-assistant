import Link from "next/link";
import { getDashboardStats, getGettingStartedProgress } from "@/server/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GettingStartedCard } from "@/components/dashboard/getting-started-card";

export default async function DashboardPage() {
  const [stats, progress] = await Promise.all([
    getDashboardStats(),
    getGettingStartedProgress(),
  ]);

  const cards = [
    {
      label: "Total Jobs",
      value: stats.totalJobs,
      href: "/jobs",
    },
    {
      label: "New This Week",
      value: stats.newThisWeek,
      href: "/jobs?discoveredSince=7d",
    },
    {
      label: "Strong Unseen",
      value: stats.strongUnseen,
      href: "/jobs?strongUnseen=true",
    },
    {
      label: "Strong Matches",
      value: stats.strongMatches,
      href: "/jobs?classification=strong",
    },
    {
      label: "Saved Jobs",
      value: stats.savedJobs,
      href: "/jobs",
    },
    {
      label: "Boards Need Attention",
      value: stats.boardsNeedingAttention,
      href: "/settings",
    },
    {
      label: "Applications",
      value: stats.applicationsSubmitted,
      href: "/applications",
    },
    {
      label: "Interviews",
      value: stats.interviews,
      href: "/applications?view=kanban",
    },
    {
      label: "Offers",
      value: stats.offers,
      href: "/applications?view=kanban",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <GettingStartedCard progress={progress} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {c.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{c.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
