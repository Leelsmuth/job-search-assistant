import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Ensure maintainer JSON is available if any route still reads from disk.
  outputFileTracingIncludes: {
    "/discovery": ["./data/company-sources.verified.json"],
    "/settings": ["./data/company-sources.verified.json"],
  },
};

export default nextConfig;
