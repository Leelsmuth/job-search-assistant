import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUser } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  return <DashboardShell email={user?.email}>{children}</DashboardShell>;
}
