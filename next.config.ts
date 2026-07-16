import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Do not use outputFileTracingIncludes for node_modules paths — pnpm symlinks
  // break Vercel's serverless packaging ("invalid deployment package").
  // Catalog JSON is statically imported; pdfjs-dist is listed above as external.
};

export default nextConfig;
