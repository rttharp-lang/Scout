import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// https://vitejs.dev/config/
// Two pages: the Scout trip planner at / and Scout Mood (the apparel
// mood-board generator) at /moodboard/.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        moodboard: resolve(root, "moodboard/index.html"),
      },
    },
  },
});
