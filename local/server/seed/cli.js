import { bootstrap } from "./index.js";
const mode = process.argv[2] || "all";
const r = bootstrap({ demo: mode === "demo" || mode === "all" });
console.log("Seeded:", r.live.id, mode);
