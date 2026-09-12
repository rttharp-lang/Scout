// LOCAL backend: Express API + static frontend + background job runner +
// scheduler, in one long-lived process backed by SQLite. Suitable for a
// container host (Fly.io, Railway, Render, a VM). Not a serverless function.
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "./db.js";
import { sessionMiddleware } from "./auth.js";
import api from "./routes/api.js";
import { bootstrap } from "./seed/index.js";
import { startWorker } from "./engine/orchestrator.js";
import { startScheduler } from "./scheduler.js";
import { checkConnectors } from "./engine/connectors/index.js";
import { llmStatus } from "./engine/llm.js";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
// Honor HTTPS_PROXY / NO_PROXY for all outbound fetches (corporate egress).
if (process.env.HTTPS_PROXY || process.env.https_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());

const here = path.dirname(fileURLToPath(import.meta.url));
// Minimal .env loader (no dependency): only sets keys that are not already set.
const envFile = path.join(here, "..", ".env");
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const PORT = Number(process.env.PORT || 8787);
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));
app.use(sessionMiddleware);
app.use((req, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "same-origin"); next(); });
app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString(), llm: llmStatus().configured ? "configured" : "not_configured", worker: true }));
app.use("/api", api);
app.use("/api", (err, req, res, next) => { console.error(err); res.status(500).json({ error: "server_error", detail: String(err.message || err) }); });

const dist = path.join(here, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: "1h", index: false }));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
}

getDb();
bootstrap();
startWorker();
startScheduler();
checkConnectors().then((cs) => console.log("[LOCAL] connectors:", cs.map((c) => `${c.id}=${c.state}`).join(" "))).catch((e) => console.error("connector check failed", e));

if (process.env.NODE_ENV !== "test") app.listen(PORT, () => console.log(`[LOCAL] listening on http://localhost:${PORT} (model ${llmStatus().configured ? "configured" : "NOT configured"})`));
export default app;
