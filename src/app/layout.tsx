import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Search Assistant",
  description: "Private-first job search and application assistant",
  applicationName: "Job Search Assistant",
  openGraph: {
    title: "Job Search Assistant",
    description: "Private-first job search and application assistant",
    siteName: "Job Search Assistant",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Job Search Assistant",
    description: "Private-first job search and application assistant",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#171717",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
