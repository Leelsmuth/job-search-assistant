import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
  build: {
    emptyOutDir: false,
    outDir: "dist",
    lib: {
      entry: path.resolve(__dirname, "src/content.ts"),
      formats: ["iife"],
      name: "JobSearchAssistantContent",
      fileName: () => "content.js",
    },
  },
});
