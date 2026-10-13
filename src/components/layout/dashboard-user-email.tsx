import { getUser } from "@/lib/supabase/server";

export async function DashboardUserEmail() {
  const user = await getUser();
  if (!user?.email) return null;

  return <p className="truncate text-xs text-muted-foreground">{user.email}</p>;
}
