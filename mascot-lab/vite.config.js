import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Two builds:
//   default   → dist/            a normal static site (deploy anywhere)
//   artifact  → dist-artifact/   one self-contained HTML file (JS, CSS, fonts
//                                 inlined) that scripts/build-artifact.mjs turns
//                                 into a claude.ai Artifact page.
export default defineConfig(({ mode }) => {
  const artifact = mode === "artifact";
  return {
    base: "./",
    plugins: [react(), ...(artifact ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    build: {
      outDir: artifact ? "dist-artifact" : "dist",
      assetsInlineLimit: artifact ? 100_000_000 : 4096,
      chunkSizeWarningLimit: 2000,
    },
    // Effect render worker (src/engine/worker/effectWorker.js): one classic IIFE bundle,
    // its own file in dist/, inlined as a blob: URL in the Artifact build (pool.js picks
    // `?worker&inline` there). IIFE can't code-split, so the worker imports every effect
    // eagerly.
    worker: { format: "iife" },
    server: { port: 5199, strictPort: true, host: "127.0.0.1" },
  };
});
