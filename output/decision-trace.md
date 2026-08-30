# Decision Trace — recommendation → finding → source
## Desk Research Edition · 30 August 2026

**Scope warning.** Every chain below terminates in a **public** source. None terminates in
proprietary VOC, POS, margin, or account data, because none was available. A trace that
ends at a press article is weaker than one ending at a POS extract, regardless of how
clean the chain looks. Source tier is stated at every terminus so this is visible.

**Source tiers:**
**T1** = primary/audited (SEC filings, company IR, league official)
**T2** = large-n research instrument (SFIA, Piper Sandler)
**T3** = established trade/business press (Forbes, CNBC, WWD, CBS)
**T4** = low-quality commercial/SEO content — *retained only where explicitly downgraded*

---

## R1 — "Advance Concept 1 (women's on-court system, women's block) to internal validation"
**The #1 recommendation. Five independent chains.**

**Hop 1 → Hop 2 → Hop 3**

| Chain | Finding | Source (tier) |
|---|---|---|
| Demand proven at scale | **F-13.2** Clark #22 = #2 jersey in all US basketball, ahead of LeBron/Dončić/Jordan | Jersey-sales trade coverage 2025-26 · **T3** |
| Demand slope | **F-13.1** WNBA merch +601% online / +233% at Dick's (2024 v 2023); >+500% since 2024, jerseys >+1,000% | WNBA official 2024 season release · **T1** *(base undisclosed — direction only)* |
| Account has named it | **F-13.4** Dick's cites women's basketball as a Q1 FY26 strength category | Dick's FY26 Q1 10-Q / IR · **T1** |
| Product deficiency is technical | **F-13.5** Unisex block = men's proportions; shoulders 17-18" v 14-15", torso +1-2", hips unshaped | Apparel-pattern technical sources + Nike design coverage · **T3** *(player quotes 2016 — stale)* |
| Spend demographic | **F-14.1** Clothing = 22% teen wallet share, highest since 2014; Nike #1; female teens leading growth | Piper Sandler *Taking Stock With Teens* 2026, n=5,690-9,193 · **T2** |
| Org can execute | **F-15.1** Sport Offense: ~8,000 staff into sport-specific teams incl. basketball | Nike IR / CEO remarks; Forbes, Axios · **T3** |

**The analytic step (2 hops):**
R1's fan-led framing → **F-10.3** (female inactivity gap widening to 6.3pp) held *against*
**F-13.1** (merch demand exploding) → SFIA 2026 Topline · **T2** + WNBA official · **T1**.
Two HIGH-confidence findings in apparent contradiction resolve to: demand is fan-led, not
participation-led. **This is an inference, not an observation — flagged as J1.**

## R2 — "Ship it wholesale-led, Dick's-anchored, not DTC-led"

| Chain | Finding | Source (tier) |
|---|---|---|
| Channel mix reversed | **F-07.1** Wholesale $25.9→$27.5bn; Nike Direct $18.8→$17.7bn on traffic decline | Nike FY2026 Form 10-K, SEC · **T1** |
| Account health diverges | **F-07.2** Dick's comp guide 2.5-4.0%; Foot Locker cut to −2.0-0.0%, cause stated as legacy footwear silhouettes / retro dependence | Dick's & Foot Locker FY26 SEC filings · **T1** |
| Category is named at the healthy account | **F-13.4** | Dick's FY26 Q1 · **T1** |

**Strongest-sourced chain in the package — three T1 termini, two hops each.**

## R3 — "Time Concept 2 to the 2026 expansion season"

| Chain | Finding | Source (tier) |
|---|---|---|
| Fixed dated event | **F-13.3** Portland Fire + Toronto Tempo join 2026, league → 15 teams, first Canadian market, new CBA | WNBA.com, CBC, CBS Sports · **T1/T3** |
| Audience is growing into it | **F-13.3** 2026 viewership +12% YoY, ~742k/game, 73m by All-Star break, 220m hours +16% | Barrett Media Jul 2026, Nielsen/ESPN · **T3** |

## R4 — "Hold China (Concept 3) pending internal data"
*A trace to a deliberate non-decision.*

| Chain | Finding | Source (tier) |
|---|---|---|
| Our position is deteriorating | **F-11.1** Greater China −13% cc FY26; ~−30% v 2021 peak; digital −29% | Nike FY2026 10-K, SEC · **T1**; CNBC 29 Jul 2026 · **T3** |
| Cause is structural | **F-11.2** China Chic shift; Anta/Li-Ning/On/Salomon/Hoka/Kailas taking specific territory | WWD, CNBC Jul 2026 · **T3** *(INFERRED)* |
| Leader is strong | **F-03.1** Anta RMB 80.22bn, +13.3% | Anta IR FY2025 · **T1** *(share figure downgraded to MED)* |
| **The blocking ambiguity** | **F-03.2** Li-Ning basketball retail −19%, cause mixed between market weakness and self-imposed inventory control | Li-Ning FY2025 results coverage · **T3** *(one retrieved figure internally inconsistent)* |

**Trace terminates in unresolved ambiguity — which is why R4 is a hold.** Recorded as **J2**.

## R5 — "Reject silhouette repositioning"
*A trace to a rejection. Included because rejections need auditing too.*

**F-09.1** → fashion-trend and commerce-blog content 2026 · **T4** → **rejected at the
skeptic layer**: no primary research, commercial incentive, and the sources contradict
each other on direction (extreme baggy revival vs. "slightly more tailored"). The spec's
requested TikTok/IG/YouTube listening data was unavailable. **No investment chain exists
because the evidence did not survive.**

## R6 — "No dollar sizing appears in this package"
*A trace to an absence.*

**F-04.1** → Technavio / Grand View / IntelMarket / Business Research Company · **T4** →
**barred from arithmetic**: undisclosed methodology, and internally incoherent (a $6.53bn
2025-30 growth forecast against a stated $4.1bn 2026 base cannot coexist with the same
cluster's ~6% CAGR). Compounded by **F-07.3** → Nike FY2026 10-K · **T1** → basketball is
**not** separately disclosed, so no primary anchor exists either.
**Both chains terminate in "cannot be known from public data."**

---

## Trace integrity audit

| Test | Result |
|---|---|
| Every recommendation reaches raw source in ≤3 hops | **Pass** — max observed 2 hops |
| Every recommendation has ≥1 T1 or T2 terminus | **Pass** — R1 (T1+T2), R2 (T1×3), R3 (T1), R4 (T1), R5 (n/a — rejection), R6 (T1) |
| No recommendation rests solely on T4 | **Pass** — the two T4-dependent chains (R5, R6) produced a rejection and an absence, not a recommendation |
| Chains terminating in proprietary data | **Zero** — the structural limitation of this edition |
| Inference points explicitly flagged | **Pass** — see `gaps-and-judgment-calls.md` |
