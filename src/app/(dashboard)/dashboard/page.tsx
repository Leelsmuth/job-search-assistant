import { getDashboardStats } from "@/server/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const cards = [
    { label: "Total Jobs", value: stats.totalJobs },
    { label: "Strong Matches", value: stats.strongMatches },
    { label: "Saved Jobs", value: stats.savedJobs },
    { label: "Applications", value: stats.applicationsSubmitted },
    { label: "Interviews", value: stats.interviews },
    { label: "Offers", value: stats.offers },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
