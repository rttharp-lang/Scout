# Product Intelligence Engine — basketball shorts POC

A dynamic multi-agent workflow that behaves like a global Product Line Management
team for the global basketball shorts market: what should Nike make, for whom, why
should it exist, what should it cost, and why should Nike invest. The engine stops at
a human decision gate; it makes no product decisions.

## What is in here

| Path | What it is |
| --- | --- |
| `agents/specialist-<domain>.json` | Raw output of the seven specialist intelligence agents (consumer, marketplace, product, commercial, culture, athlete, design): top signals with the full evidence rule, tensions, domain opportunities, research narrative, sources. |
| `agents/skeptic-<domain>.json` | The independent skeptic's verdict on every signal and opportunity of that specialist: VERIFIED / PLAUSIBLE - NEEDS VALIDATION / REJECTED, tests failed, counter-evidence, preserved contradictions. |
| `agents/audit.json` | Cross-dataset auditor: duplicated signals, contradictory datasets, geographic bias, hype versus sustained. |
| `agents/lens-<convergence|nonobvious|whitespace>.json` | The three opportunity-orchestrator lenses and their candidate intersections. |
| `agents/synthesis.json` | Merged cross-domain patterns and the synthesized opportunity set. |
| `agents/dev-OPP-nn.json` / `agents/challenge-OPP-nn.json` | Per-opportunity development spec and red-team challenge. |
| `agents/ranker-<plm|finance|design>.json` / `agents/portfolio.json` | Three independent rankers and the portfolio chair's INVEST / EXPLORE / WATCH / REJECT ranking. |
| `agents/gate-OPP-nn.json` | Human decision gate per opportunity: what the machine knows, believes, and what the human must decide. |
| `agents/summary.json` | Executive summary, market framing, research gaps, limitations. |
| `data.json` | Everything above merged into one dataset (generated). |
| `template.html` | The website template. Data is injected at build time. |

Generated deliverables:

- `../basketball-shorts-product-intelligence.md` — the decision-grade report.
- `../public/product-intelligence/index.html` — the website, served at `/product-intelligence/` by the Scout app (Vite copies `public/` as-is).

## Rebuild

```
node scripts/build-product-intelligence.mjs
```

Add `--artifact <path>` to also emit a self-contained variant with the Druk fonts inlined.

## Graph

1. Fan out seven specialist agents, independently and in parallel, each with live web research.
2. Evidence rule on every finding: source, date, data type, geography, consumer or market, confidence, quantitative / qualitative / inferred; classified FACT / PATTERN / HYPOTHESIS.
3. Each specialist returns top signals, tensions and 3-5 domain opportunities without ranking outside its domain.
4. An independent skeptic attacks each specialist; a cross-dataset auditor checks the whole evidence base. Rejected findings do not move forward; contradictions are preserved.
5. Three opportunity orchestrators look for cross-domain intersections; a synthesis agent merges them.
6. Each opportunity is developed in full and then red-teamed.
7. Three portfolio rankers score ten criteria; a chair reconciles them without forcing category counts.
8. Human decision gate. STOP.
