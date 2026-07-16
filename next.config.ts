import type { NextConfig } from "next";

const catalogDataFiles = ["./data/company-sources.verified.json"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Bundled JSON is imported statically; this ensures file tracing on Vercel as backup.
  outputFileTracingIncludes: {
    "/discovery": catalogDataFiles,
    "/settings": catalogDataFiles,
    "/jobs": catalogDataFiles,
    "/jobs/import": catalogDataFiles,
    "/api/cron/discover": catalogDataFiles,
    "/onboarding": [
      ...catalogDataFiles,
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    "/resumes": [
      ...catalogDataFiles,
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
