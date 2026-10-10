import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// https://vitejs.dev/config/
// Pages: Scout (/, and /scout/ for links from NBA Fandom) and NBA Fandom (formerly Home Court), the NBA local-fandom intelligence site (/nba/).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        nba: resolve(__dirname, "nba/index.html"),
        scout: resolve(__dirname, "scout/index.html"),
      },
    },
  },
});
