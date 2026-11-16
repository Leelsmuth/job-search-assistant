import type { Metadata } from "next";
import { DemoShell } from "./demo-shell";

export const metadata: Metadata = {
  title: "Demo · Job Search Assistant",
  description:
    "Try the job feed and application tracker with sample data. No account needed; changes stay in your browser.",
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoShell>{children}</DemoShell>;
}
