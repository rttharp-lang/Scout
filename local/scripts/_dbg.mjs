import { chromium } from "playwright";
import fs from "node:fs"; import path from "node:path";
const base="/opt/pw-browsers"; let exe; for (const d of fs.readdirSync(base)) if (d.startsWith("chromium-")) { const p=path.join(base,d,"chrome-linux","chrome"); if (fs.existsSync(p)) exe=p; }
const b = await chromium.launch({ executablePath: exe }); const p = await b.newPage();
p.on("console", (m) => console.log("console:", m.type(), m.text().slice(0,200)));
p.on("pageerror", (e) => console.log("pageerror:", e.message));
p.on("response", (r) => { if (r.url().includes("/api/")) console.log("resp", r.status(), r.url()); });
await p.goto("http://localhost:8791/login"); await new Promise(r=>setTimeout(r,1500));
console.log("title", await p.title(), "has form", await p.$("form") ? "yes":"no");
await p.fill("#email","admin@local.dev"); await p.fill("#pw","local-admin"); await p.click("text=Sign in"); await new Promise(r=>setTimeout(r,3000));
console.log("url", p.url()); console.log((await p.textContent("body")).slice(0,300));
await b.close();
