import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Ensure maintainer JSON is available if any route still reads from disk.
  outputFileTracingIncludes: {
    "/discovery": ["./data/company-sources.verified.json"],
    "/settings": ["./data/company-sources.verified.json"],
    "/onboarding": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/resumes": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
