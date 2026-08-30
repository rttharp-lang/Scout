# Gaps and Judgment Calls
## Basketball Apparel Product Research Package — Desk Research Edition

**Date:** 2026-08-30
**Status:** Original corpus absent (§2). Proceeded as EXTERNAL-only desk research at the
requester's direction. §§1-4 record the original input gap; §§5-8 record the gaps and
judgment calls inside the desk research that was actually produced.

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

## 4. Why the pipeline was halted at first pass

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
was written for partial coverage. Applied to the internal corpus it cuts all 15 domains,
which is the same halt, and this document is the "say so."

**Resolution.** On being shown this, the requester directed a narrower **EXTERNAL-only desk
research** package instead. That was then produced, grounded in retrieved public sources
rather than model priors, with 10 of 15 domains partially servable and 5 cut outright
(package §1). The prohibition on invention held throughout: where public data ran out, the
finding was cut, downgraded, or logged below rather than filled in. Sections 5-8 record
what that cost.

## 5. Judgment calls in the desk research

Marked per the spec's FLAG requirement: every point where the chain relied on judgment
rather than data. **These are the PLM handoff points.**

### Structural calls (about the exercise itself)

| # | Call | Basis | Alternative rejected |
|---|---|---|---|
| J-A | Treat absent `/data` as a hard stop rather than substituting model knowledge silently | Spec forbids invention; output is externally benchmarked | Writing the full package from priors |
| J-B | On the desk-research instruction, ground findings in retrieved public sources rather than model memory | Real citations are auditable; priors are not, and the knowledge cutoff predates FY26 results | Writing from general category knowledge |
| J-C | Report zero findings for cut domains rather than LOW-confidence ones | A LOW score implies weak evidence; for domains 01/05/08/12 there is *no* evidence | Emitting LOW-confidence findings from priors |
| J-D | Retain the full skeptic layer despite the thin evidence base | With weak sources, adversarial review is the main quality control — it killed F-09.1 and barred F-04.1 | Running specialists only |

### Analytic calls (inside the findings)

| # | Call | Where | Why it is judgment, not data | What would settle it |
|---|---|---|---|---|
| **J1** | **Women's demand is fan-led, not participation-led** | §4 OS-1; drives Concept 1's fan-to-court positioning | Reconciling F-10.3 (female inactivity gap widening) with F-13.1 (merch demand exploding). Both are observed; **the reconciliation is inferred.** Alternative reading — participation among *basketball-specific* women is rising while general activity falls — is equally consistent with the data. | Basketball-specific female participation data, split fan vs. player; purchase data by player/non-player |
| **J2** | **China treated as ambiguous rather than as an opening** | §4 OS-3; §6 R-4; ranks Concept 3 third | F-03.2's −19% has management attributing it to *both* market weakness *and* deliberate destocking. Public data cannot separate them. **Category contraction and share availability imply opposite investments.** | China basketball category POS by brand; Li-Ning primary annual report |
| **J3** | **Fit deficiency assumed still current** | F-13.5; the core of Concept 1 | The pattern-block geometry is a physical constant, but the player-complaint evidence is from 2016 — **nine years stale.** Assuming the deficiency persists is judgment. | Current returns-reason coding, fit reviews, NSRL women's fit studies |
| **J4** | **Concept 1 price tiers ($40-55 / $75-90)** | §5 Concept 1 | Anchored to one observed retail price ($79.99) plus a T4-sourced ladder. **No elasticity, cost, or margin input exists.** These are shelf-price orientation, not a price strategy. | Elasticity tests; cost roll-up; competitive price-volume by tier |
| **J5** | **Client inferred as Nike** | §0; all competitive/geo research | Inferred from the repo brand mark and the NSRL/NDDC/KAPE acronyms. **Never stated.** | Confirm in one line |
| **J6** | **Upside ratings (HIGH/MED) in the §7 ranking table** | §7 | These are directional judgments from demand signals. **No margin, cost, or POS data existed to validate any of them.** Flagged in-table. | Queries 1 & 2 in §7 |
| **J7** | **"Wholesale-led" go-to-market generalised from company-level mix** | §4 OS-2; Concept 1 channel | F-07.1 is company-wide across all categories. **Applying it to basketball apparel specifically is inference.** | Basketball apparel channel split |
| **J8** | **Domain-cut decisions** | §1 | Which domains were "servable enough" to run was a judgment about evidence quality, not a rule. Domain 09 was run and then rejected — arguably it should not have run. | — |

## 6. Data gaps inside the desk research

Ordered by how much each blocks the recommendation.

| Rank | Gap | Blocks | Consequence |
|---|---|---|---|
| **1** | **Absolute size of the women's basketball apparel base** | R-1; the entire investment case | Every women's growth figure is a percentage on an **undisclosed base**. +1,000% on a trivial base is a trivial business. **Nothing here rules that out.** |
| **2** | **Margin, cost, and SKU economics for a women's-specific block** | R-3; Concept 1 viability | New patterns, grading and SKU count at lower per-SKU volume may be structurally dilutive. Could invalidate Concept 1 outright. |
| **3** | **Any elasticity data** | J4; all pricing | Price tiers are shelf observations. No demand curve exists anywhere in this package. |
| **4** | **Current VOC — reviews, returns coding, NSRL, NDDC** | J3; Domain 01 | The consumer deficiency at the heart of Concept 1 rests on 2016 quotes plus pattern geometry. |
| **5** | **Own catalog / product architecture** | R-5; Domain 05 | **Cannibalisation is entirely unassessed.** Overlap with existing women's training/sportswear is unknown. |
| **6** | **Social listening (TikTok/IG/YouTube)** | R-7; Domain 09 | Silhouette direction — normally a first-order apparel decision — **cannot be made.** Sources contradicted each other. |
| **7** | **Market Loop output** | Domain 15; the benchmark | Absent as input *and* as comparison. |
| **8** | **KAPE and wholesale sell-through** | Domain 02 | Retailer public filings are a thin proxy; no account-level asks. |
| **9** | **EMEA + APLA regional demand** | Domain 12 | Cut entirely. **No global rollout claim is supportable.** |
| **10** | **Basketball as a disclosed revenue line** | F-07.3 | No primary sizing anchor exists even internally-public. |
| **11** | **Athlete and on-court performance feedback** | Domain 08 | No performance-innovation claim is made anywhere, by necessity. |
| **12** | **Capacity and lead times** | R-6 | Cannot confirm Concept 2 can land against dated 2026 season events. |

## 7. Source-quality register

| Tier | Sources used | Findings resting on them |
|---|---|---|
| **T1** primary/audited | Nike FY2026 10-K, Dick's & Foot Locker SEC filings, Anta IR, WNBA official | F-03.1, F-07.1, F-07.2, F-07.3, F-11.1, F-13.1, F-13.3, F-13.4 |
| **T2** large-n instruments | SFIA 2026 Topline; Piper Sandler *Taking Stock With Teens* | F-10.1, F-10.2, F-10.3, F-14.1, F-14.2 |
| **T3** established trade press | Forbes, CNBC, WWD, CBS, CBC, Axios, Barrett Media | F-03.2, F-03.3, F-11.2, F-13.2, F-13.5, F-15.1 |
| **T4** SEO/affiliate content | trend blogs, buying guides, market-research teasers | **F-09.1 (rejected), F-04.1 (barred from arithmetic), F-06.1 (downgraded)** |

**Every T4-dependent finding was rejected, barred, or downgraded. No recommendation rests
on a T4 source.**

## 8. PLM handoff — what to do with this

1. **Do not take this to the investment review as an investment case.** It is a hypothesis
   set. The §7 gating queries (absolute base; margin model) must return first.
2. **Run the four §7 queries.** Queries 1 and 2 are gating — an adverse result on either
   stops Concept 1.
3. **Confirm J5** (client identity) in one line.
4. **Resolve J2** (China) before any Concept 3 spend.
5. **Supply the corpus** to re-run the full 15-domain pipeline as originally specified.
   §6 above is the collection priority order; §3 is the full manifest.
6. **Expect this to lose to the Market Loop package** on insight quality and completeness.
   It should be compared on *method and honesty*, not on conclusions — its conclusions are
   drawn from data every competitor can also read.
