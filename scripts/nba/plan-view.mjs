// Prints the parts of a market brief that the review layer annotates, with
// the indexes plan.json and evidence.json refer to.
//   node scripts/nba/plan-view.mjs <team> [calendar|opportunities|insights|doors]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../research/nba");
const [team, part] = process.argv.slice(2);
const s = JSON.parse(fs.readFileSync(path.join(ROOT, team, "strategy.json"), "utf8"));
const show = (p) => !part || part === p;

if (show("insights")) {
  console.log("TOP INSIGHTS");
  s.topInsights.forEach((t, i) => console.log(`[${i}] ${t.title}\n    ${t.insight}\n    → ${t.implication}`));
}
if (show("calendar")) {
  console.log("\nCALENDAR (in brief order; the brief was written in October 2026)");
  s.calendar.forEach((c, i) => console.log(`[${i}] month ${c.month} · p${c.priority} · window: ${JSON.stringify(c.window)}\n    moment: ${c.moment}\n    play: ${c.play}\n    products: ${c.products.join(" | ")}\n    channel: ${c.channel}`));
}
if (show("opportunities")) {
  console.log("\nOPPORTUNITIES");
  s.opportunities.forEach((o) => console.log(`[${o.id}] ${o.title} · p${o.priority} · size ${o.size} · months ${o.months.join(",")}\n    summary: ${o.summary}\n    segment: ${o.segment}\n    when: ${o.when}\n    how: ${o.how}\n    where: ${o.where.join(" | ")}\n    products: ${o.products.join(" | ")}`));
}
if (show("doors")) {
  console.log("\nRETAIL PLAYBOOK · where");
  s.retailPlaybook.where.forEach((w) => console.log(`  - ${w}`));
  console.log("\nPARTNERS");
  s.partners.forEach((p) => console.log(`  - ${p.name} (${p.type}): ${p.idea}`));
  console.log("\nVERIFY QUEUE (strategy)");
  (s.provenance.verify || []).forEach((v) => console.log(`  - ${v}`));
}
