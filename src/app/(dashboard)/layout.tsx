import { Suspense } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { DashboardUserEmail } from "@/components/layout/dashboard-user-email";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell
      email={
        <Suspense fallback={null}>
          <DashboardUserEmail />
        </Suspense>
      }
    >
      {children}
    </DashboardShell>
  );
}
