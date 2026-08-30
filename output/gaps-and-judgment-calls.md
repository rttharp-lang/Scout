# Gaps and Judgment Calls
## Basketball Apparel Product Research Package — BLOCKED AT INPUT STAGE

**Status:** Pipeline halted before Tier 1. No specialist agents were run.
**Date:** 2026-08-30
**Reason:** The required input corpus does not exist in this environment.

---

## 1. What the spec required

> INPUTS: Load everything in /data before any agent starts. Tag each source by type:
> VOC | MARKETPLACE | PRODUCT | COMMERCIAL | EXTERNAL | INTERNAL-KNOWLEDGE.
> If a required input is missing, log it as a GAP — do not invent it.

This document is that GAP log. Per the spec's own instruction, nothing below has been
substituted with invented data.

## 2. What is actually present

Environment surveyed: repository root, all subdirectories, mount points, attachment
directories, and a full filesystem sweep for research-shaped artifacts
(`*.csv`, `*.xlsx`, `*NSRL*`, `*NDDC*`, `*KAPE*`, `*voc*`, `*market*loop*`).

| Path | Expected | Found |
|---|---|---|
| `/data` | Full source corpus | **Does not exist** |
| `/home/user/Scout/data` | Alternate corpus location | **Does not exist** |
| `/mnt/attach` | Uploaded attachments | Empty |
| `/mnt/user-data/working` | Working files | Empty |
| Repository `rttharp-lang/scout` | — | Vite/React travel-planning app ("Scout"). Unrelated domain. |

The repository contains a travel itinerary product (`api/`, `src/App.jsx`,
`api/tripcuration.js`). It holds no VOC, marketplace, commercial, or category data of
any kind. The only basketball-adjacent artifact is an unused brand logo SVG at the repo
root, which is not a data source.

**Total source documents available for the 15 research domains: zero.**

## 3. Domain-by-domain gap register

Every domain is blocked. Each row lists the specific artifacts needed to unblock it, so
this doubles as a collection manifest for the PLM.

| # | Domain | Required inputs (by spec data type) | Status |
|---|---|---|---|
| 01 | Consumer Voice | Product reviews export; returns/defect coding; NSRL study decks; NDDC survey waves — *VOC* | MISSING |
| 02 | Key Account | KAPE feedback logs; wholesale sell-through by account; retailer line-review asks — *COMMERCIAL* | MISSING |
| 03 | Competitive | adidas / Puma / UA / Li-Ning / Anta line sheets, pricing, launch calendars — *EXTERNAL* | MISSING |
| 04 | Market Sizing | Category growth series; share by brand; price-tier unit volume — *MARKETPLACE* | MISSING |
| 05 | Product Architecture | Own catalog master; attribute taxonomy; lifecycle + launch history — *PRODUCT* | MISSING |
| 06 | Price Point | Price ladder by silhouette; elasticity tests; feature-set-by-tier map — *MARKETPLACE / COMMERCIAL* | MISSING |
| 07 | Commercial | POS by week; margin by style; bookings; forecast; inventory + rebuy rates — *COMMERCIAL* | MISSING |
| 08 | Athlete & On-Court | Pro/college equipment feedback; uniform specs; performance test results — *INTERNAL-KNOWLEDGE* | MISSING |
| 09 | Culture & Social | TikTok / IG / YouTube listening exports; trend reports — *EXTERNAL* | MISSING |
| 10 | Participation | Participation surveys by age, gender, geography, frequency — *EXTERNAL* | MISSING |
| 11 | Geo: Greater China | Local competitor pricing; channel structure; consumer research — *EXTERNAL / MARKETPLACE* | MISSING |
| 12 | Geo: EMEA + APLA | Regional demand signals; distribution footprint — *MARKETPLACE* | MISSING |
| 13 | Women's Basketball | Fit/sizing complaint data; WNBA/NCAA halo metrics; style research — *VOC / EXTERNAL* | MISSING |
| 14 | Youth | Gen Z/Alpha preference research; youth sizing data; family purchase behavior — *VOC / EXTERNAL* | MISSING |
| 15 | Strategy Alignment | **Market Loop outputs**; category strategy doc; seasonal plan — *INTERNAL-KNOWLEDGE* | MISSING |

Note on domain 15: the Market Loop outcome is both a required input to this domain *and*
the benchmark this package is to be judged against. Neither copy is present.

## 4. Why the pipeline was halted rather than run

The spec's architecture — 15 specialists, 15 skeptics, 3 orchestrators, 1 chief — is a
structure for *processing* evidence. With an empty corpus it does not degrade into a
weaker answer; it produces fluent, well-formatted fabrication. Specifically, running it
would have generated:

- Market sizing figures with no measurement behind them
- Confidence scores (HIGH/MED/LOW) computed over nothing
- A `decision-trace.md` whose three-hop walk-back terminates at invented sources
- Skeptic passes that "validate" findings by failing to disprove fiction

The TRACE and RULE requirements are the tell. Both exist to make the package auditable
against raw data. Satisfying their *format* without their *substance* is worse than
returning nothing, because the citation scaffolding would launder invented numbers into
something that reads as verified — and this package is destined for an investment review
and a side-by-side quality comparison. A fabricated package could win that comparison on
presentation while being entirely untethered from reality.

The spec anticipated this: *"If a required input is missing, log it as a GAP — do not
invent it."* Applied to a total absence of input, that instruction resolves to halting.

The related clause — *"Cut or merge domains where the data isn't there — but say so"* —
was written for partial coverage. Applied here it cuts all 15 domains, which is the same
halt, and this document is the "say so."

## 5. Judgment calls made (the only ones in this package)

| # | Call | Basis | Alternative rejected |
|---|---|---|---|
| J1 | Treat absent `/data` as a hard stop, not a prompt to substitute general knowledge | Spec forbids invention; output is decision-grade and externally benchmarked | Writing the package from model priors about the basketball apparel category |
| J2 | Do not synthesize a "directionally right" placeholder package | Placeholders in this format are indistinguishable from researched output once saved to `/output` | Marking every section SPECULATIVE and proceeding |
| J3 | Convert the halt into a collection manifest (§3) | The domain list plus data-type tags is derivable from the spec alone, with no invention | Returning only an error |
| J4 | Report zero findings rather than low-confidence findings | A LOW confidence score implies weak evidence; there is no evidence | Emitting LOW-confidence findings from priors |

## 6. PLM handoff points

1. **Provide the corpus.** Mount the source files and the pipeline runs as specified.
2. **Confirm scope if the corpus is partial.** If only some domains can be supplied,
   name them — the spec permits cutting domains, and §3 is the checklist.
3. **Supply the Market Loop output separately.** It is needed as an input (domain 15)
   and is held as the comparison benchmark.
4. **Confirm whether general/public knowledge is admissible.** If an *EXTERNAL*-only,
   explicitly-labelled desk-research package is wanted instead, that is a different and
   much narrower deliverable — no proprietary VOC, POS, margin, or account data — and it
   should be commissioned deliberately, not produced as a silent fallback.
