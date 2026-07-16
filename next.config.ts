import type { NextConfig } from "next";

const catalogDataFiles = ["./data/company-sources.verified.json"];
const pdfWorkerFile = "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";

const resumeRoutes = ["/onboarding", "/resumes", "/profile", "/applications"] as const;

const outputFileTracingIncludes: Record<string, string[]> = {
  "/discovery": catalogDataFiles,
  "/settings": catalogDataFiles,
  "/jobs": catalogDataFiles,
  "/jobs/import": catalogDataFiles,
  "/api/cron/discover": catalogDataFiles,
};

for (const route of resumeRoutes) {
  outputFileTracingIncludes[route] = [...catalogDataFiles, pdfWorkerFile];
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  outputFileTracingIncludes,
};

export default nextConfig;
