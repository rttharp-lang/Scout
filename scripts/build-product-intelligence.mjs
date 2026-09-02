// Build the Basketball Shorts Product Intelligence deliverables from the raw
// agent outputs in product-intelligence/agents/:
//   product-intelligence/data.json                 merged dataset (single source of truth)
//   public/product-intelligence/index.html         the website (deck-styled, self-contained)
//   basketball-shorts-product-intelligence.md      the decision-grade report
// Optional: --artifact <path> also writes a claude.ai Artifact variant with the
// Druk fonts inlined as data URIs and the outer document skeleton stripped.
//
// Run with:  node scripts/build-product-intelligence.mjs [--artifact out.html]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS = path.join(ROOT, "product-intelligence", "agents");
const TEMPLATE = path.join(ROOT, "product-intelligence", "template.html");
const OUT_HTML = path.join(ROOT, "public", "product-intelligence", "index.html");
const OUT_DATA = path.join(ROOT, "product-intelligence", "data.json");
const OUT_MD = path.join(ROOT, "basketball-shorts-product-intelligence.md");

const argv = process.argv.slice(2);
const artifactOut = argv.includes("--artifact") ? argv[argv.indexOf("--artifact") + 1] : null;

const readJson = (name) => {
  const p = path.join(AGENTS, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};
const listJson = (prefix) => fs.readdirSync(AGENTS).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort();

// ── 1. Merge ──────────────────────────────────────────────────────────────
const KEYS = ["consumer", "marketplace", "product", "commercial", "culture", "athlete", "design"];
const LABELS = { consumer: "Consumer", marketplace: "Marketplace", product: "Product", commercial: "Commercial", culture: "Cultural + Trend", athlete: "Athlete / Performance", design: "Design" };

const specialists = [];
for (const key of KEYS) {
  const spec = readJson(`specialist-${key}.json`);
  if (!spec) continue;
  const skeptic = readJson(`skeptic-${key}.json`);
  const sv = new Map((skeptic?.signal_verdicts || []).map((v) => [v.signal_id, v]));
  const ov = new Map((skeptic?.opportunity_verdicts || []).map((v) => [v.opportunity_id, v]));
  const top_signals = spec.top_signals.map((s) => {
    const v = sv.get(s.id);
    const rc = (v?.reclassified_as || "unchanged").trim().toUpperCase();
    return {
      ...s,
      original_classification: s.classification,
      classification: ["FACT", "PATTERN", "HYPOTHESIS"].includes(rc) ? rc : s.classification,
      verdict: v?.verdict || "UNREVIEWED",
      tests_failed: v?.tests_failed || [],
      skeptic_reasoning: v?.reasoning || "",
      counter_evidence: v?.counter_evidence || [],
      validation_needed: v?.validation_needed || "",
    };
  });
  const opportunities = spec.opportunities.map((o) => {
    const v = ov.get(o.id);
    return { ...o, verdict: v?.verdict || "UNREVIEWED", skeptic_reasoning: v?.reasoning || "", weakest_assumption: v?.weakest_assumption || "", validation_needed: v?.validation_needed || "" };
  });
  specialists.push({ key, label: LABELS[key], ...spec, top_signals, opportunities, skeptic });
}

const audit = readJson("audit.json");
const lenses = listJson("lens-").map((f) => readJson(f)).filter(Boolean);
const synthesis = readJson("synthesis.json");
const portfolio = readJson("portfolio.json");
const summary = readJson("summary.json");
const rankers = listJson("ranker-").map((f) => ({ key: f.replace("ranker-", "").replace(".json", ""), ...readJson(f) }));

const signalIndex = new Map();
for (const a of specialists) for (const s of a.top_signals) signalIndex.set(s.id, { ...s, agent_id: a.agent_id, agent_name: a.agent_name, agent_key: a.key });

const opportunities = (synthesis?.opportunities || []).map((o) => {
  const development = readJson(`dev-${o.id}.json`);
  const challenge = readJson(`challenge-${o.id}.json`);
  const gate = readJson(`gate-${o.id}.json`);
  const entry = portfolio?.ranking?.find((r) => r.id === o.id) || null;
  const ranker_scores = rankers.map((r) => ({ key: r.key, persona: r.persona, ...(r.scores.find((s) => s.id === o.id) || {}) })).filter((s) => s.criteria);
  return { ...o, name: development?.name || o.name, development, challenge, gate, portfolio: entry, ranker_scores };
});
opportunities.sort((a, b) => (a.portfolio?.rank ?? 99) - (b.portfolio?.rank ?? 99));

const allSignals = specialists.flatMap((a) => a.top_signals);
const evidenceItems = specialists.flatMap((a) => a.top_signals.flatMap((s) => s.evidence.map((e) => ({ ...e, agent_id: a.agent_id, agent_key: a.key, signal_id: s.id, signal_title: s.title, classification: s.classification, verdict: s.verdict }))));
const count = (arr, f) => arr.filter(f).length;
const stats = {
  agents: specialists.length,
  agents_total_run: specialists.length * 2 + (audit ? 1 : 0) + lenses.length + (synthesis ? 1 : 0) + opportunities.filter((o) => o.development).length + opportunities.filter((o) => o.challenge).length + rankers.length + (portfolio ? 1 : 0) + opportunities.filter((o) => o.gate).length + (summary ? 1 : 0),
  signals: allSignals.length,
  verified: count(allSignals, (s) => s.verdict === "VERIFIED"),
  plausible: count(allSignals, (s) => s.verdict.startsWith("PLAUSIBLE")),
  rejected: count(allSignals, (s) => s.verdict === "REJECTED"),
  facts: count(allSignals, (s) => s.classification === "FACT"),
  patterns: count(allSignals, (s) => s.classification === "PATTERN"),
  hypotheses: count(allSignals, (s) => s.classification === "HYPOTHESIS"),
  evidence_items: evidenceItems.length,
  sources: new Set(specialists.flatMap((a) => a.sources.map((s) => s.url)).filter(Boolean)).size,
  domain_opportunities: specialists.reduce((n, a) => n + a.opportunities.length, 0),
  synthesized: opportunities.length,
  invest: count(opportunities, (o) => o.portfolio?.category === "INVEST"),
  explore: count(opportunities, (o) => o.portfolio?.category === "EXPLORE"),
  watch: count(opportunities, (o) => o.portfolio?.category === "WATCH"),
  reject: count(opportunities, (o) => o.portfolio?.category === "REJECT"),
};

const data = { generated: "2026-09-02", market: "Global basketball shorts", stats, specialists, audit, lenses, synthesis, opportunities, rankers: rankers.map(({ scores, ...r }) => r), portfolio, summary, evidence: evidenceItems };
fs.writeFileSync(OUT_DATA, JSON.stringify(data, null, 1));
console.log(`data.json: ${specialists.length} specialists, ${allSignals.length} signals, ${opportunities.length} opportunities, ${evidenceItems.length} evidence items`);

// ── 2. Website ────────────────────────────────────────────────────────────
const template = fs.readFileSync(TEMPLATE, "utf8");
const safeJson = JSON.stringify(data).replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\u0021--");
const fontFace = (family, file, weight, dataUri) => `@font-face{font-family:"${family}";src:url("${dataUri || "/fonts/" + file}") format("woff2");font-weight:${weight};font-style:normal;font-display:swap;}`;
const siteFonts = fontFace("Druk Wide Heavy", "DrukWide-Heavy.woff2", 400) + fontFace("Druk Heavy", "DrukHeavy.woff2", 900);
fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true });
const reportLink = '<a class="link" href="basketball-shorts-product-intelligence.md">Report (.md)</a> · ';
fs.writeFileSync(OUT_HTML, template.replace("/*{{FONT_CSS}}*/", siteFonts).replace("{{REPORT_LINK}}", reportLink).replace("{{DATA_JSON}}", safeJson));
console.log(`site: ${OUT_HTML} (${(fs.statSync(OUT_HTML).size / 1024).toFixed(0)} KB)`);

if (artifactOut) {
  const b64 = (f) => "data:font/woff2;base64," + fs.readFileSync(path.join(ROOT, "public", "fonts", f)).toString("base64");
  const inlineFonts = fontFace("Druk Wide Heavy", "", 400, b64("DrukWide-Heavy.woff2")) + fontFace("Druk Heavy", "", 900, b64("DrukHeavy.woff2"));
  let html = template.replace("/*{{FONT_CSS}}*/", inlineFonts).replace("{{REPORT_LINK}}", "").replace("{{DATA_JSON}}", safeJson);
  // Artifact pages are wrapped in a skeleton at publish time: ship head contents + body contents only.
  const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1].replace(/<meta[^>]*>/gi, "").trim();
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1].trim();
  fs.mkdirSync(path.dirname(artifactOut), { recursive: true });
  fs.writeFileSync(artifactOut, head + "\n" + body + "\n");
  console.log(`artifact: ${artifactOut} (${(fs.statSync(artifactOut).size / 1024).toFixed(0)} KB)`);
}

// ── 3. Markdown report ───────────────────────────────────────────────────
const md = [];
const H = (n, t) => md.push(`${"#".repeat(n)} ${t}`, "");
const P = (t) => { if (t) md.push(t, ""); };
const L = (items) => { for (const i of items) md.push(`- ${i}`); md.push(""); };
const T = (headers, rows) => { md.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`); for (const r of rows) md.push(`| ${r.map((c) => String(c ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`); md.push(""); };
const sig = (id) => { const s = signalIndex.get(id); return s ? `${id} (${s.agent_id}: ${s.title})` : id; };

H(1, "Basketball Shorts Product Intelligence Report");
P(`**Product Intelligence Engine, dynamic workflow proof-of-concept.** Nike Basketball Apparel. Market: ${data.market}. Generated ${data.generated}. Status: **HUMAN DECISION GATE OPEN.** No product briefing or concept development proceeds until the PLM / Design team selects an opportunity.`);
P(`Pipeline run: ${stats.agents} specialist agents → ${stats.agents} independent skeptics → cross-dataset audit → ${lenses.length} opportunity-orchestrator lenses → synthesis → ${opportunities.filter((o) => o.development).length} opportunity developments → ${opportunities.filter((o) => o.challenge).length} red-team challenges → ${rankers.length} portfolio rankers → portfolio chair → ${opportunities.filter((o) => o.gate).length} human decision gates → report editor. ${stats.agents_total_run} agent runs in total.`);
T(["Metric", "Value"], [["Signals surfaced", stats.signals], ["Verified", stats.verified], ["Plausible, needs validation", stats.plausible], ["Rejected by skeptics", stats.rejected], ["FACT / PATTERN / HYPOTHESIS (after skeptic reclassification)", `${stats.facts} / ${stats.patterns} / ${stats.hypotheses}`], ["Evidence items with source, date, geography, confidence", stats.evidence_items], ["Distinct sources", stats.sources], ["Domain-level opportunities proposed", stats.domain_opportunities], ["Synthesized cross-domain opportunities", stats.synthesized], ["INVEST / EXPLORE / WATCH / REJECT", `${stats.invest} / ${stats.explore} / ${stats.watch} / ${stats.reject}`]]);
md.push("**Contents.** 1. Executive opportunity summary · 2. Ranked product opportunities · 3. Human decisions required · 4. Cross-domain patterns · 5. Opportunity dossiers · 6. Specialist intelligence findings · 7. Contradictory evidence · 8. Research gaps · 9. Methodology and limitations · 10. Full evidence trace", "");

H(2, "1. Executive opportunity summary");
P(summary?.executive_summary || "_Executive summary pending (phase 3 not yet run)._");
if (summary?.market_framing) { H(3, "Market framing"); P(summary.market_framing); }
if (portfolio?.three_most_consequential) {
  H(3, "The three most consequential opportunities and why each surfaced");
  for (const t of portfolio.three_most_consequential) { H(4, `${t.id} — ${t.name}`); P(`**Why it surfaced.** ${t.why_it_surfaced}`); P(`**Domains that converged.** ${t.which_domains_converged}`); P(`**What makes it consequential.** ${t.what_makes_it_consequential}`); }
}
if (summary?.how_to_read_confidence) { H(3, "How to read confidence"); P(summary.how_to_read_confidence); }

H(2, "2. Ranked product opportunities (INVEST / EXPLORE / WATCH / REJECT)");
if (portfolio) {
  P(portfolio.narrative);
  T(["Rank", "ID", "Opportunity", "Category", "Overall (0-100)", "Confidence (0-100)", "Why this category"], portfolio.ranking.map((r) => [r.rank, r.id, r.name, `**${r.category}**`, r.overall, r.confidence_score, r.why_this_category]));
  H(3, "Criterion scores (1 = weak, 5 = strong; risk 5 = low risk)");
  const CR = ["consumer_need", "market_whitespace", "commercial_potential", "product_differentiation", "cultural_relevance", "basketball_authenticity", "nike_right_to_win", "evidence_strength", "scalability", "risk"];
  T(["ID", ...CR.map((c) => c.replace(/_/g, " "))], portfolio.ranking.map((r) => [r.id, ...CR.map((c) => r.final_scores[c])]));
  if (portfolio.disagreements?.length) { H(3, "Where the rankers disagreed (preserved, not averaged)"); for (const d of portfolio.disagreements) L([`**${d.id}.** ${d.description} _Resolution:_ ${d.resolution}`]); }
  H(3, "Portfolio observations"); L(portfolio.portfolio_observations);
} else P("_Ranking pending (phase 3 not yet run)._");

H(2, "3. Human decisions required");
P("The engine stops here. For each opportunity: what the machine knows (evidence-supported), what it believes (interpretation), and what only a human can decide.");
for (const o of opportunities) {
  if (!o.gate) continue;
  H(3, `${o.id} — ${o.name} (${o.portfolio?.category || "unranked"})`);
  md.push("**What the machine knows**"); L(o.gate.what_the_machine_knows.map((k) => `[${k.classification}] ${k.statement} _(${k.signal_ids.join(", ")})_`));
  md.push("**What the machine believes**"); L(o.gate.what_the_machine_believes.map((b) => `${b.statement} _(basis: ${b.basis}; confidence ${b.confidence})_`));
  md.push("**What the human must decide**"); L(o.gate.what_the_human_must_decide.map((d) => `${d.decision} _(${d.judgment_type})_ — ${d.why_machine_cannot}`));
  P(`**If selected:** ${o.gate.if_selected_next_step}`); P(`_${o.gate.do_not_proceed_note}_`);
}

H(2, "4. Cross-domain patterns");
if (audit) { P(audit.narrative); }
if (synthesis) {
  P(synthesis.narrative);
  for (const p of synthesis.cross_domain_patterns) L([`**${p.id} ${p.title}** [${p.strength}] — ${p.description} Domains: ${p.domains.join(" × ")}. Signals: ${p.signal_ids.join(", ")}. Feeds: ${p.feeds_opportunities.join(", ")}.`]);
  for (const l of lenses) { H(3, `Orchestrator lens: ${l.lens}`); P(l.narrative); L(l.candidates.map((c) => `**${c.id} ${c.name}** — ${c.thesis} _Intersection:_ ${c.intersection}. _Why hard to see:_ ${c.why_hard_to_see}`)); }
  if (synthesis.dropped_candidates?.length) { H(3, "Candidates dropped at synthesis"); L(synthesis.dropped_candidates.map((d) => `${d.candidate_ids.join(", ")} — ${d.reason}`)); }
} else P("_Orchestration pending (phase 2 not yet run)._");

H(2, "5. Opportunity dossiers");
for (const o of opportunities) {
  const d = o.development, c = o.challenge, r = o.portfolio;
  H(3, `${o.id} — ${o.name}${r ? ` · ${r.category} · rank ${r.rank} · confidence ${r.confidence_score}/100` : ""}`);
  P(`**Thesis.** ${o.thesis}`); P(`**Intersection.** ${o.intersection} (${o.domains_reinforcing.join(" × ")}; lenses: ${o.lens_origins.join(", ")})`); P(`**Why an individual PLM would find this hard to see.** ${o.why_hard_to_see}`);
  if (!d) { P("_Development pending._"); continue; }
  T(["Field", "Content"], [["OPPORTUNITY", d.opportunity], ["TARGET CONSUMER", d.target_consumer], ["CONSUMER PROBLEM / JOB TO BE DONE", d.consumer_problem_jtbd], ["PRODUCT IDEA", d.product_idea], ["WHY NOW", d.why_now], ["TARGET PRICE", `${d.target_price.currency} ${d.target_price.msrp} — ${d.target_price.tier}. ${d.target_price.rationale} ${d.target_price.regional_notes}`], ["MARKET / DISTRIBUTION ROLE", d.market_distribution_role], ["NIKE RIGHT TO WIN", d.nike_right_to_win], ["CONFIDENCE SCORE", `${d.confidence_score}/100 (developer) → ${c ? c.adjusted_confidence_score + "/100 (after red team)" : "n/a"}${r ? " → " + r.confidence_score + "/100 (portfolio chair)" : ""}. ${d.confidence_rationale}`]]);
  md.push("**Key features / benefits**"); T(["Feature", "Benefit", "Signals"], d.key_features_benefits.map((f) => [f.feature, f.benefit, f.supporting_signal_ids.join(", ")]));
  md.push("**Evidence stack (which specialist agents contributed)**"); T(["Agent", "Signals", "Contribution", "Strength"], d.evidence_stack.map((e) => [`${e.agent_id} ${e.agent_name}`, e.signal_ids.join(", "), e.contribution, e.evidence_strength]));
  md.push("**Contradictory evidence**"); L(d.contradictory_evidence.length ? d.contradictory_evidence.map((x) => `[${x.severity}] ${x.description} _(${x.signal_ids.join(", ")})_`) : ["None recorded by the developer; see red team."]);
  if (c) { md.push("**Red-team challenge**"); P(`Strongest counterargument: ${c.strongest_counterargument} Survives: **${c.survives ? "yes" : "no"}** (adjusted confidence ${c.adjusted_confidence_score}/100: ${c.adjustment_rationale})`); T(["Angle", "Argument", "Evidence", "Outcome"], c.kill_attempts.map((k) => [k.angle, k.argument, k.evidence, k.outcome])); if (c.additional_contradictory_evidence?.length) L(c.additional_contradictory_evidence.map((x) => `[${x.severity}] ${x.finding} — ${x.source} (${x.source_date}) ${x.url}`)); md.push("**Validation plan**"); T(["Question", "Method", "Who", "Cost / time"], c.validation_plan.map((v) => [v.question, v.method, v.who, v.cost_time])); }
  md.push("**What would need to be true**"); L(d.what_would_need_to_be_true);
  md.push("**What we still don't know**"); L(d.what_we_still_dont_know);
  if (d.competitive_reference_points?.length) { md.push("**Competitive reference points**"); T(["Brand", "Product", "Price", "Note"], d.competitive_reference_points.map((x) => [x.brand, x.product, x.price, x.note])); }
  if (o.ranker_scores?.length) { md.push("**Ranker views**"); T(["Ranker", "Overall", "Category", "Rationale", "Biggest risk"], o.ranker_scores.map((s) => [s.persona, s.overall, s.category, s.rationale, s.biggest_risk])); }
  md.push("**Developer narrative**"); P(d.narrative);
}

H(2, "6. Specialist intelligence findings");
for (const a of specialists) {
  H(3, `${a.agent_id} — ${a.agent_name}`);
  P(a.research_narrative);
  H(4, "Top signals");
  for (const s of a.top_signals) {
    md.push(`**${s.id} ${s.title}** — ${s.classification}${s.original_classification !== s.classification ? ` (specialist said ${s.original_classification})` : ""} · skeptic: **${s.verdict}**`, "");
    P(s.finding); P(`_Consumer groups:_ ${s.consumer_groups} · _Implication:_ ${s.implication}`);
    T(["Source", "Date", "Data type", "Geography", "Consumer / market", "Confidence", "Nature", "Excerpt"], s.evidence.map((e) => [e.url ? `[${e.source}](${e.url})` : e.source, e.source_date, e.data_type, e.geography, e.consumer_or_market, e.confidence, e.evidence_nature, e.excerpt]));
    if (s.skeptic_reasoning) P(`_Skeptic:_ ${s.skeptic_reasoning}${s.tests_failed.length ? ` Tests failed: ${s.tests_failed.join(", ")}.` : ""}${s.validation_needed ? ` Validation needed: ${s.validation_needed}` : ""}`);
    if (s.counter_evidence?.length) L(s.counter_evidence.map((x) => `Counter-evidence: ${x.finding} — ${x.source} (${x.source_date}) ${x.url}`));
  }
  H(4, "Tensions"); L(a.tensions.map((t) => `**${t.id} ${t.title}** — ${t.description} (${t.signal_ids.join(", ")})`));
  H(4, "Domain opportunities (pre-synthesis)");
  for (const o of a.opportunities) { md.push(`**${o.id} ${o.name}** — confidence ${o.confidence} · skeptic: **${o.verdict}**`, ""); T(["Field", "Content"], [["Target consumer", o.target_consumer], ["Job to be done", o.job_to_be_done], ["Product problem", o.product_problem], ["Proposed solution", o.proposed_solution], ["Key features", o.key_features.join("; ")], ["Price position", o.price_position], ["Evidence", o.evidence_signal_ids.join(", ")], ["Key unanswered question", o.key_unanswered_question], ["Skeptic", `${o.skeptic_reasoning} Weakest assumption: ${o.weakest_assumption} Validation: ${o.validation_needed}`]]); }
  if (a.skeptic) { H(4, "Skeptic report"); P(a.skeptic.method_narrative); if (a.skeptic.preserved_contradictions?.length) L(a.skeptic.preserved_contradictions.map((c) => `**Contradiction: ${c.title}** — ${c.description} (${c.signal_ids.join(", ")})`)); P(`**Biggest miss:** ${a.skeptic.biggest_miss}`); }
}

H(2, "7. Contradictory evidence");
if (audit) {
  for (const c of audit.contradictory_datasets) L([`**${c.title}.** Side A (${c.side_a.signal_ids.join(", ")}): ${c.side_a.claim} Side B (${c.side_b.signal_ids.join(", ")}): ${c.side_b.claim} _Assessment:_ ${c.assessment} _Would resolve it:_ ${c.what_would_resolve_it}`]);
  H(3, "Duplicated signals (counted once)"); L(audit.duplicated_signal_clusters.map((d) => `**${d.title}** — ${d.signal_ids.join(", ")}: ${d.shared_basis} → ${d.treatment}`));
  H(3, "Geographic bias of the evidence base"); P(audit.geographic_bias.assessment); P(`Estimated share by region: ${audit.geographic_bias.estimated_share_of_evidence_by_region}. Underrepresented: ${audit.geographic_bias.underrepresented_markets.join(", ")}. ${audit.geographic_bias.implication}`);
  H(3, "Hype versus sustained behavior"); T(["Topic", "Durability", "Assessment", "Signals"], audit.hype_vs_sustained.map((h) => [h.topic, h.durability, h.assessment, h.signal_ids.join(", ")]));
  H(3, "Signal adjustments"); T(["Signal", "Action", "Note"], audit.signal_adjustments.map((s) => [sig(s.signal_id), s.action, s.note]));
} else P("_Audit pending._");
const specContras = specialists.flatMap((a) => (a.skeptic?.preserved_contradictions || []).map((c) => ({ ...c, agent: a.agent_id })));
if (specContras.length) { H(3, "Contradictions preserved by the per-domain skeptics"); L(specContras.map((c) => `**${c.agent} · ${c.title}** — ${c.description} (${c.signal_ids.join(", ")})`)); }
const rejectedAll = specialists.flatMap((a) => [...a.top_signals.filter((s) => s.verdict === "REJECTED").map((s) => `${s.id} ${s.title} — ${s.skeptic_reasoning}`), ...a.opportunities.filter((o) => o.verdict === "REJECTED").map((o) => `${o.id} ${o.name} — ${o.skeptic_reasoning}`)]);
H(3, "Rejected by the skeptics (did not move forward)"); L(rejectedAll.length ? rejectedAll : ["None."]);

H(2, "8. Research gaps");
if (summary) { T(["Gap", "Why it matters", "Affects", "How to close", "Suggested owner"], summary.research_gaps.map((g) => [g.gap, g.why_it_matters, g.affects_opportunities.join(", "), g.how_to_close, g.owner_suggestion])); H(3, "Recommended validation sequence"); L(summary.recommended_validation_sequence); } else P("_Pending._");

H(2, "9. Methodology and limitations");
P("Graph: (1) fan out seven specialist intelligence agents, each researching its own domain with live web search and the evidence rule; (2) every finding carries source, date, data type, geography, consumer/market, confidence and quantitative/qualitative/inferred nature and is classified FACT / PATTERN / HYPOTHESIS; (3) each specialist returns top signals, tensions and 3-5 domain opportunities; (4) an independent skeptic attacks each specialist's findings and classifies them VERIFIED / PLAUSIBLE - NEEDS VALIDATION / REJECTED, rejected findings are removed, contradictions preserved; a cross-dataset auditor then checks duplicated signals, contradictory datasets, geographic bias and hype vs. sustained behavior across all domains; (5) three opportunity orchestrators (convergence, non-obvious, whitespace) find cross-domain intersections and a synthesis agent merges them; (6) each synthesized opportunity is developed into a full definition and then red-teamed; (7) three portfolio rankers score every opportunity on ten criteria and a chair reconciles them into INVEST / EXPLORE / WATCH / REJECT without forcing counts; (8) the engine stops at a human decision gate.");
if (summary) L(summary.methodology_limitations);
if (audit) { P("**Evidence base quality.** Strengths: " + audit.evidence_base_quality.strengths.join("; ") + ". Weaknesses: " + audit.evidence_base_quality.weaknesses.join("; ") + ". Balance: " + audit.evidence_base_quality.quant_vs_qual_balance); }

H(2, "10. Full evidence trace");
P(`${evidenceItems.length} evidence items across ${stats.signals} signals. Verdicts are the per-domain skeptic's; classification is post-skeptic.`);
T(["Agent", "Signal", "Class", "Verdict", "Source", "Date", "Data type", "Geography", "Consumer / market", "Conf.", "Nature"], evidenceItems.map((e) => [e.agent_id, `${e.signal_id} ${e.signal_title}`, e.classification, e.verdict, e.url ? `[${e.source}](${e.url})` : e.source, e.source_date, e.data_type, e.geography, e.consumer_or_market, e.confidence, e.evidence_nature]));
H(3, "Sources consulted by specialist");
for (const a of specialists) { md.push(`**${a.agent_id} ${a.agent_name}** (${a.sources.length} sources)`, ""); L(a.sources.map((s) => `${s.url ? `[${s.source}](${s.url})` : s.source} (${s.date}) — ${s.contribution}`)); }
md.push("---", "", "_Generated by the Product Intelligence Engine proof-of-concept. Evidence is drawn from public web sources retrieved by AI research agents on the run date; it does not include Nike internal data. Human judgment is required before any product decision._");
fs.writeFileSync(OUT_MD, md.join("\n"));
fs.copyFileSync(OUT_MD, path.join(path.dirname(OUT_HTML), "basketball-shorts-product-intelligence.md"));
console.log(`report: ${OUT_MD} (${(fs.statSync(OUT_MD).size / 1024).toFixed(0)} KB)`);
