import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// Vite's dev/preview servers only map /moodboard/ (with the slash) to
// moodboard/index.html; a bare /moodboard falls back to the trip planner.
// Redirect it so local dev behaves like Vercel, which serves both.
const pageSlash = (pages) => {
  const redirect = (req, res, next) => {
    const [path, qs] = (req.url || "").split("?");
    if (!pages.includes(path)) return next();
    res.statusCode = 302;
    res.setHeader("Location", `${path}/${qs ? `?${qs}` : ""}`);
    res.end();
  };
  return {
    name: "page-trailing-slash",
    configureServer: (server) => { server.middlewares.use(redirect); },
    configurePreviewServer: (server) => { server.middlewares.use(redirect); },
  };
};

// https://vitejs.dev/config/
// Two pages: the Scout trip planner at / and Scout Mood (the apparel
// mood-board generator) at /moodboard/.
export default defineConfig({
  plugins: [react(), pageSlash(["/moodboard"])],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        moodboard: resolve(root, "moodboard/index.html"),
      },
    },
  },
});
