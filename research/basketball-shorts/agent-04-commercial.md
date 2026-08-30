# AGENT 04 — COMMERCIAL INTELLIGENCE
## Domain: Global Basketball Shorts | Compiled 2026-08-30

---

## METHODOLOGY AND ITS LIMITS

### What I have
No Nike proprietary data. Zero. No sell-through, no rebuy rate, no SKU productivity, no bookings, no margin by style, no inventory by length. Everything below is a **public proxy** for commercial truth, and the gap between proxy and truth is the single most important thing on this page.

### What actually happened during this research session — stated plainly
Two hard constraints degraded this work and you should discount accordingly:

1. **Direct page fetching was blocked network-wide.** Every WebFetch attempt was refused by the egress proxy: `amazon.com`, `nike.com`, `sec.gov`, `investors.nike.com`, `s1.q4cdn.com` (the Nike transcript PDF), `finance.yahoo.com`, `fool.com`, `stockx.com`, `dickssportinggoods.com`, `statista.com`, `wikipedia.org`, `tradingview.com`. I could not open a single primary document. **I never read the Nike 10-K or a full earnings transcript.**
2. **The web-search budget was exhausted mid-investigation** (200/200 calls, a session-level pool shared with other agents). I completed 17 productive searches before the cutoff and had roughly 12 planned queries left unrun — most painfully, Amazon review-count concentration, StockX last-sale data, and Nike/Foot Locker size-level stockout scans.

**Consequence:** every financial figure below is a *search-engine summary of a primary source*, not the primary source. That is one layer of paraphrase away from the filing. I have flagged confidence accordingly, and I have flagged one figure that does not reconcile and that I could not verify (see Signal 2). **Do not put any number in this report into a deck without re-pulling the filing.** That instruction is not boilerplate; it is the honest state of the evidence.

### What public proxies CAN tell you
- **Direction and relative order of magnitude** on category momentum, when a company names a category on an earnings call (Nike said basketball grew; Adidas said basketball fell 20%). These are audited-adjacent, legally consequential statements.
- **Observed retail price and discount depth**, which is a direct, unmediated read on how the market is clearing a specific style. Markdown depth is the closest public thing to a sell-through confession.
- **The shape of the assortment ladder** — which lengths and franchises exist at which price points.
- **Where a competitor is weak** — often more legible publicly than where you are strong.

### What public proxies CANNOT tell you — and what people wrongly claim they can
- **Markdown ≠ failure, and full price ≠ success.** A marked-down short may be an end-of-life colorway executing exactly to plan. A full-price short may be full-price because it was under-bought by 60%. Discount depth is a *signal of clearance pressure on that SKU at that door*, nothing more. Anyone converting an observed 46% markdown into "over-investment in 10-inch" is guessing; I flag that inference as HYPOTHESIS below and I mean it.
- **Amazon review counts are not units.** They are units × review rate × listing age × review-solicitation intensity, and the review rate for a $25 3-pack from a marketplace seller who inserts a review-request card is structurally many times that of a $30 Nike short. Cross-brand review comparisons are close to meaningless. Within-brand, within-price-band velocity is weakly usable. I could not obtain review counts at all this session.
- **Best-seller rank is a rank, not a volume**, and Amazon's basketball nodes are polluted (see Signal 6).
- **Google Trends is search interest, not demand.** It cannot separate "buying" from "looking up how long basketball shorts should be."
- **Nothing public tells you Nike's basketball shorts business.** Nike does not disclose revenue by product class below footwear/apparel/equipment. "Basketball up high single digits" is Nike's *total* basketball category — dominated by footwear. Reading a shorts conclusion out of it is unsupported.
- **Resale premium was unobtainable.** StockX is blocked. Any statement about NOCTA or Fear of God resale value in this report would be fabricated, so there is none.

### Labeling convention
**FACT** = publicly disclosed or directly observed. **PATTERN** = repeats across multiple independent observations. **HYPOTHESIS** = my inference; requires internal validation.

---

## TOP SIGNALS

---

### SIGNAL 1 — Nike basketball is growing while Adidas basketball is collapsing. This is the largest commercial asymmetry in the category.
**Label: FACT (both disclosures) → PATTERN (four consecutive quarters of divergence)**

Nike named basketball as a growth category in three of four FY26 quarters: Q1 FY26 "running, training and basketball each delivered double-digit growth"; Q3 FY26 "Basketball up high single digits" while Sportswear declined double digits; Q4 FY26 management called out strong response to Knicks-championship product and a Caitlin Clark footwear *and apparel* line for holiday 2026.

Simultaneously, Adidas disclosed basketball **-20% in Q1 2026 and -21% in Q2 2026 — the only declining category in a quarter where total currency-neutral revenue grew 14% to a record €6,743M and apparel grew 35%.** CEO Bjørn Gulden: "Basketball is in a transitional phase."

> **Source:** Nike Q1/Q3/Q4 FY26 earnings calls (via search summaries); adidas Q1 2026 and Q2 2026 releases + Gulden commentary (via search summaries) | **Source date:** 2025-09-30, 2026-03-31, 2026-06-30, 2026-04, 2026-07 | **Data type:** Company disclosure, category-level qualitative + quantitative | **Geography:** Global | **Represents:** Total company basketball category (footwear-weighted) | **Confidence:** High on direction, Medium on precision (not read in primary) | **Evidence nature:** Quantitative (Adidas), Qualitative (Nike — no % given)

**Why it matters commercially:** Adidas is contracting basketball *while it is winning everywhere else*. A brand growing 14% overall does not hold shelf space for a category down 21% indefinitely — it either reinvests or retreats. Both outcomes are actionable. If Adidas retreats, wholesale basketball shorts doors open in H2 FY27. If it reinvests, the reinvestment is signposted as **signature footwear**, not apparel — Gulden named footwear and technology, not shorts.

**HYPOTHESIS:** Adidas basketball apparel shelf space at US mid-tier wholesale (DICK'S, Academy, Hibbett) is more contestable in the next 12 months than at any point in five years. *Requires internal validation: Nike's own door-level share-of-shelf tracking.*

---

### SIGNAL 2 — Nike's FY26 was a margin-repair year, not a growth year, and the repair was explicitly built on cutting markdowns
**Label: FACT (with one unreconciled figure — see caution)**

FY26 (ended 2026-05-31) landed at roughly **$46.4B revenue** — essentially flat. The quarterly path:

| Quarter | Reported | Revenue | Gross margin | Key note |
|---|---|---|---|---|
| Q1 FY26 | 2025-09-30 | $11.72B, +1% | 42.2%, **-320bps** | Wholesale $6.8B +7%; profit -31% |
| Q2 FY26 | 2025-12-18 | $12.4B, +1% rep / flat cn | — | Wholesale $7.5B **+8%**; Nike Direct $4.6B **-8%**; NA +9% to $5.63B; **Greater China -17% to $1.42B** |
| Q3 FY26 | 2026-03-31 | flat rep / **-3% cn** | 40.2%, **-130bps** | "elevated tariffs and promotions" |
| Q4 FY26 | 2026-06-30 | $10.97B | 49.2%, **+890bps** (incl. ~900bps tariff recovery) | **Ex-tariff GM -10bps**, beat guidance of -25/-75bps |

Q4 mechanics, in management's own framing: four straight quarters of *sequential* margin improvement driven by **better North America discounting, lower reserves and fewer markdowns**. EMEA **off-price down over 50%**, producing a **15-point improvement in full-price realization**. Inventory **$7.5B, flat YoY**. Forward: tighten buys, reduce future sell-in, accept revenue moderation to get margin — H1 FY27 revenue guided **down low-to-mid single digits** with GM expansion starting Q1 FY27.

> **Source:** Nike FY26 quarterly releases and calls; FY26 10-K (nke-20260531.htm) | **Source date:** 2025-09-30 → 2026-06-30 | **Data type:** Audited/regulated financial disclosure | **Geography:** Global, with segment detail | **Represents:** Total Nike Inc. | **Confidence:** High on the narrative; **Medium on individual figures (primary documents unreadable this session)** | **Evidence nature:** Quantitative

> **⚠ CAUTION — UNRECONCILED FIGURE.** A search summary attributed to the FY26 10-K states *"footwear revenues increased 5% currency-neutral, units +6%, ASP -1pt; apparel revenues increased 4% currency-neutral, units +2%, ASP +2pts."* **This does not reconcile with a flat ~$46.4B full year** and I could not open the filing to determine whether it describes a segment, a quarter, or a prior year. **Treat as unverified. Re-pull before use.** I am flagging rather than deleting it because if it *is* the FY26 full-year read, it says something important: apparel grew on price, footwear grew on units — the exact inverse of a healthy apparel franchise.

**What this means for basketball shorts specifically — HYPOTHESIS:** A "tighten buys, reduce sell-in, protect full price" mandate lands hardest on high-volume, low-differentiation, easily-substituted core apparel. Basketball shorts core franchises (Icon, DNA) are precisely that profile. **The buy is probably being cut on exactly the SKUs where Nike has the most unit share to lose to $25 multipacks.** *Requires internal validation: FY27 basketball apparel buy plan vs FY26 actuals by franchise and length.*

---

### SIGNAL 3 — Observed markdown depth is concentrated in the LONG-INSEAM core performance short, across four independent retailers
**Label: PATTERN (four independent doors) → the causal reading is HYPOTHESIS**

Every Nike basketball short I could observe in clearance on 2026-08-30 sits in the **Icon / DNA core performance franchise**, and the deepest cuts sit at **10 and 11 inch inseams**. See the full observation table below. Summary:

- Nike.com DNA 10": $50 → **$30.97 (-38%)**
- DICK'S Going Going Gone DNA 10": $50 → **$26.98 (-46%)**
- DICK'S Nike DNA range: as low as **$9.72 against $50 MSRP (-81%)**
- Nike.com Dri-FIT Icon: $30 → **$18.97 (-37%)**
- Nike.com Icon 11": $35 → $28.97 (-17%)
- Kohl's clearance Icon 8": $35 → $26.25 (-25%)

Meanwhile **Nike.com operates a standing, permanently-merchandised landing page: "Sale Under $25 Basketball Shorts"** (`nike.com/w/sale-under-25-basketball-shorts-...`). A dedicated always-on sub-$25 basketball shorts sale surface is an architectural admission, not a seasonal event.

> **Source:** Nike.com sale pages, DICK'S goinggoinggone.com, Kohl's clearance, Foot Locker sale — all observed via search-result snippets | **Source date:** 2026-08-30 | **Data type:** Observed retail pricing | **Geography:** US | **Represents:** US retail clearance channel | **Confidence:** Medium-High that the prices are real; **Low on completeness** — snippets are not a systematic scan, and I could not verify how long these prices have persisted or at what size/colour depth | **Evidence nature:** Quantitative (prices), Inferred (the length concentration)

**HYPOTHESIS:** The 10"/11" long-inseam core short is over-invested relative to current demand, and the 6" short is under-supplied. **The evidence for the first half is decent; the evidence for the second half is absent, not positive** — I observed few 6" styles in clearance, and absence of clearance is *not* evidence of sell-out. It is equally consistent with a small buy. *Requires internal validation: sell-through % and weeks-of-supply by inseam, and full-price sell-through curve by length.* This is the single highest-value internal question in this report.

---

### SIGNAL 4 — Nike's basketball shorts price ladder has a hole between $35 and $55, and the top of the ladder is discounting at the same rate as the bottom
**Label: PATTERN (observed ladder) → HYPOTHESIS (the hole)**

Observed US price architecture:

| Tier | Franchise | MSRP | Observed discount |
|---|---|---|---|
| Opening | Dri-FIT Icon (6"/8"/11") | $30–$35 | -17% to -37% |
| Core | Dri-FIT DNA (6"/8"/10") | $45–$60 | -22% to **-81%** |
| Signature | Nike LeBron 8" | $90 | **-25%** |
| Jordan | Brooklyn Cat Scratch | $55 | -18% |
| Competitor premium | adidas Crazylight | $80 | **-40%** |

Two readings. First, there is thin occupancy between the top of Icon ($35) and the middle of DNA ($55) — the exact band where the informed-but-not-rich player shops. Second, and more concerning: **the $90 LeBron short was discounting at 25%, the same order as the $30 Icon.** A signature-tier product that clears at the same discount rate as an opening-price commodity is not functioning as a premium product; it is functioning as an expensive commodity.

> **Source:** Foot Locker sale pages, Nike.com, Kohl's, DICK'S | **Source date:** 2026-08-30 | **Data type:** Observed retail pricing | **Geography:** US | **Represents:** US athletic specialty + mid-tier department | **Confidence:** Medium (snippet-derived, not a full scan) | **Evidence nature:** Quantitative price points, Inferred structure

---

### SIGNAL 5 — The $25–$40 multipack is where mass-market shorts demand is actually being served, and Nike does not compete there
**Label: PATTERN → commercial size is HYPOTHESIS**

Amazon's best-selling *athletic shorts* are dominated by unbranded/marketplace brands built around three attributes: **quick-dry, pockets, and multipacks** — NORTHYARD (offered at 5"/7"/9"), BOOJO (3-pack gym/basketball shorts, quick-dry, pockets), G Gradual (9"/11", pockets). The $25–$30 Amazon band is populated by BOOJO, Real Essentials, NY Threads, JWJ. 3-packs of big-and-tall mesh dry-fit basketball shorts are an established listing format.

The economics are stark: **a 3-pack at $30 is $10 per short against a $30–$50 Nike single.** For a consumer buying shorts as consumable basics — gym, lounge, sleep, yard — the Nike short is a 3–5x price multiple for a job the multipack does adequately.

> **Source:** Amazon Best Sellers Men's Athletic Shorts; Amazon multipack search listings | **Source date:** 2026-08-30 | **Data type:** Marketplace assortment and rank observation | **Geography:** US | **Represents:** US Amazon shoppers (mass, value-led) | **Confidence:** High that this assortment dominates the node; **LOW on size — I could not obtain a single review count or rank number this session** | **Evidence nature:** Qualitative + Inferred

**Critical honesty note:** the brief asked me to size the multipack business from review volume. **I could not, because Amazon is blocked and search budget ran out.** I am not going to estimate it. The correct next move is a systematic Amazon rank/review scrape, which is a 2-hour job with working network access.

---

### SIGNAL 6 — Amazon's "Men's Basketball Clothing" node is won by cheap fleece sweatpants, not basketball product
**Label: FACT (observed) → HYPOTHESIS (interpretation)**

The top-ranked items in Amazon's Men's Basketball Clothing best-seller node were **Fruit of the Loom Eversoft Fleece Elastic Bottom Sweatpants, Hanes Essentials Jersey Sweatpants, and Amazon Essentials Fleece Open-Bottom Sweatpants.**

> **Source:** Amazon Best Sellers, Men's Basketball Clothing (node 2419328011) | **Source date:** 2026-08-30 | **Data type:** Marketplace rank | **Geography:** US | **Represents:** US Amazon shoppers | **Confidence:** Medium-High on the observation | **Evidence nature:** Qualitative

**Two competing readings, and I cannot distinguish them:**
- **(a) Taxonomy artifact.** Sellers keyword-stuff "basketball" into generic bottoms and Amazon's node assignment is noisy. This would make the observation useless for demand.
- **(b) Genuine consumer truth.** "Basketball clothing" as a *shopping category* has been absorbed into generic comfort basics — the consumer entering that node is not buying to play, and buys the cheapest acceptable soft bottom.

Reading (b), if true, is one of the most consequential facts in this domain, because it says the category's mass-market volume is not defended by basketball credibility at all. **This is resolvable in 20 minutes with working Amazon access and is my #1 external research request.**

---

### SIGNAL 7 — Nike is back on Amazon and was already the #1 apparel brand there without trying
**Label: FACT**

Nike resumed direct Amazon sales (announced 2025-05-21, first since 2019), launching in Q1 FY26 with a branded store spanning **running, training, basketball and sportswear**. A May 2025 Coresight survey found **Nike was the top-selling apparel brand on Amazon, with 38% of Amazon apparel shoppers having bought Nike in the prior 12 months** — achieved entirely through third-party sellers, with no Nike merchandising. Nike's CFO downplayed it: not a "material needle-mover" right away.

> **Source:** CNBC 2025-05-21; Modern Retail; Coresight Research survey (May 2025) | **Source date:** 2025-05 to 2025-09 | **Data type:** Company announcement + consumer survey | **Geography:** US | **Represents:** US Amazon apparel shoppers | **Confidence:** High | **Evidence nature:** Quantitative (survey), Qualitative (strategy)

**HYPOTHESIS:** Amazon is the *single best-instrumented* venue Nike now has for testing basketball shorts price elasticity, length preference, and multipack acceptance — because Nike gets first-party ASIN-level data and Amazon shoppers self-select into price-comparison behavior. Nike's own DTC cannot generate that read, because Nike.com traffic is brand-loyal and price-insensitive by selection.

---

### SIGNAL 8 — Nike Direct is shrinking while wholesale grows: the channel that will actually sell incremental shorts units is wholesale
**Label: FACT**

Q2 FY26: **wholesale $7.5B, +8%; Nike Direct $4.6B, -8%.** Q1 FY26: wholesale $6.8B, +7%. This is a deliberate reversal of the 2020–2023 DTC strategy, and it has run for at least four quarters.

> **Source:** Nike Q1 and Q2 FY26 results releases | **Source date:** 2025-09-30, 2025-12-18 | **Data type:** Segment financial disclosure | **Geography:** Global | **Confidence:** High | **Evidence nature:** Quantitative

**Why it matters for shorts:** wholesale is a *pre-committed, futures-booked* channel. It rewards a clean, simple, well-priced line plan set 6–9 months ahead and punishes late-breaking assortment complexity. A basketball shorts strategy designed for DTC storytelling will underperform in a wholesale-led marketplace. **HYPOTHESIS:** the winning FY27–28 shorts line is *narrower and clearer*, not broader.

---

### SIGNAL 9 — The women's basketball commercial signal is unambiguous and the apparel supply response is documented as inadequate
**Label: FACT (WNBA merch growth) + FACT (supply-desert reporting) → HYPOTHESIS (shorts specifically)**

WNBA merchandise: WNBAStore.com plus the NYC flagship up a **combined 601% vs 2023**; Fanatics-network league merchandise **+500%** season-to-date with **player merchandise +1,000%**; highest attendance in 22 years, **+48%**. Front Office Sports characterized the **$4 billion women's sports merchandise market as "a supply desert."** Nike is launching a full Caitlin Clark line — Nike Caitlin 1 footwear on 2026-10-01 at $140, with signature apparel; her first logo tee shipped 2026-09-01, hoodies/pants/premium apparel to follow. Clark's contract is reported at $28M.

> **Source:** WNBA.com 2024 season release; Fanatics Inc / SBJ; Front Office Sports; CBS Sports; SoleRetriever/Hypebeast | **Source date:** 2024-09 (merch growth), 2026-04 to 2026-08 (Clark line) | **Data type:** League disclosure, retailer disclosure, trade reporting | **Geography:** US | **Represents:** US women's basketball fans | **Confidence:** High on growth rates; **Medium-Low on currency — the strongest merch figures are 2024-season, and I could not obtain verified 2026-season numbers before the search budget ran out** | **Evidence nature:** Quantitative (growth %), Qualitative (supply desert)

**Note the shape of the disclosed demand: jerseys, tees, hoodies, pants, "premium apparel." Shorts are not named in any source I found.** That is either a gap in my evidence or a gap in the market. **HYPOTHESIS:** women's basketball *performance shorts* are under-served relative to the fan-merch tiers that captured the growth, because the growth has been fan-led (jersey/tee) rather than participation-led. *Requires internal validation: Nike women's basketball shorts unit trend and full-price sell-through, FY24→FY26.*

---

### SIGNAL 10 — Basketball shorts demand is multi-peaked, and the peaks do not line up with a single buy
**Label: PATTERN — Low confidence source**

Reported search-interest pattern for "basketball shorts": **April** peak (youth/spring sports), **June** peak (index 86, outdoor/summer season), and a **December** peak (index 99 — the annual high, gifting). Youth basketball shorts sales specifically peaked April 2025.

> **Source:** accio.com trend aggregations citing Google Trends | **Source date:** 2025–2026 | **Data type:** Search interest index, third-party aggregated | **Geography:** Likely US, unstated | **Represents:** Search behavior, not purchase | **Confidence:** **LOW** — secondary aggregation of Google Trends, methodology unstated, could not verify at source | **Evidence nature:** Inferred

**Why I am including a low-confidence signal:** because the *structure* it implies is testable internally in an afternoon and matters a lot. Three peaks with different buyers (youth-team parent in April, adult outdoor player in June, gift-giver in December) served by one seasonal buy is a recipe for either stockout in one peak or markdown after another. **The December gifting peak being the annual high, for a summer-coded product, is the most commercially interesting claim here — and the one I most distrust.**

---

## OBSERVED MARKDOWN / SELL-OUT EVIDENCE

All observations 2026-08-30, US market, derived from search-result snippets (pages themselves were not loadable — see Methodology). Prices are as reported in indexed snippets and may lag live pricing.

| # | Retailer | Product | Reg. | Observed | Disc. | URL | Read |
|---|---|---|---|---|---|---|---|
| 1 | Nike.com | Dri-FIT Icon Men's Basketball Shorts | $30 | **$18.97** | **-37%** | nike.com/w/sale-basketball-shorts-38fphz3glsmz3yaepz5k5r2 | Opening-price core at deep cut |
| 2 | Nike.com | Nike DNA Dri-FIT 10" Basketball Shorts | $50 | **$30.97** | **-38%** | nike.com/t/dna-mens-dri-fit-basketball-shorts-hVGm16 | Long inseam, core franchise |
| 3 | Nike.com | Nike Icon Dri-FIT 11" Basketball Shorts | $35 | $28.97 | -17% | nike.com/w/mens-dri-fit-basketball-shorts-32dxrz38fphz3glsmznik1 | Longest inseam, modest cut |
| 4 | Nike.com | *Standing* "Sale Under $25 Basketball Shorts" page | — | <$25 | — | nike.com/w/sale-under-25-basketball-shorts-2ylu5z38fphz3glsmz3yaep | **Permanent sub-$25 sale surface exists as merchandising architecture** |
| 5 | DICK'S / Going Going Gone | Nike Dri-FIT DNA 10" Basketball Shorts | $50 | **$26.98** | **-46%** | goinggoinggone.com/f/clearance-basketball-shorts | Deep clearance, long inseam |
| 6 | DICK'S | Nike Dri-FIT DNA Basketball Shorts (range) | $50 | **$9.72–$37.50** | **up to -81%** | dickssportinggoods.com/f/nike-basketball-shorts | **Terminal clearance. -81% is liquidation, not promotion** |
| 7 | Kohl's | Men's Nike Dri-FIT Icon 8" Basketball Short | $35 | $26.25 | -25% | kohls.com/catalog/clearance-nike-shorts-bottoms-clothing.jsp | Mid inseam, mid-tier door |
| 8 | Kohl's | Girls Nike Victory Shorts | $27 | $17.55 | -35% | kohls.com/catalog/clearance-nike-shorts-bottoms-clothing.jsp | Girls' bottoms clearing hard |
| 9 | Foot Locker | Nike Dri-FIT DNA 24 Shorts | $45 | $35.00 | -22% | footlocker.com/category/sport/basketball/sale/clothing/nike/shorts.html | Athletic specialty |
| 10 | Foot Locker | Nike Dri-FIT DNA 8" Shorts | $60 | $45.00 | -25% | footlocker.com/category/sport/basketball/sale/clothing/nike/shorts.html | Top of DNA ladder discounting |
| 11 | Foot Locker | **Nike LeBron 8" Shorts** | **$90** | **$67.50** | **-25%** | footlocker.com/category/sport/basketball/sale/clothing/shorts.html | **Signature tier clearing like a commodity** |
| 12 | Foot Locker | Jordan Brooklyn Cat Scratch Shorts | $55 | $45.00 | -18% | footlocker.com/category/sport/basketball/sale/clothing/shorts.html | Shallowest Nike-family cut observed |
| 13 | Foot Locker | **adidas Crazylight Shorts** | **$80** | **$48.00** | **-40%** | footlocker.com/category/sport/basketball/sale/clothing/shorts.html | **Corroborates adidas basketball -21%** |

### Sell-out / stockout evidence
**NONE OBTAINED.** Size and colour availability, restock cadence, and resale premium all require loading live product pages or StockX. Every attempt was egress-blocked. **I have zero sell-out observations and I am not going to imply otherwise.** The only adjacent facts I could establish: Nike x NOCTA Basketball Shorts (SS22) trade actively on StockX across black, white and Asia-sizing variants — meaning a resale market *exists* — and NOCTA sells basketball shorts DTC at nocta.com. **Last-sale prices and premium-to-retail: unknown.**

### What the markdown table does and does not support
- **Supported:** Nike basketball shorts are being cleared at meaningful depth across four independent US channels simultaneously, at the end of the summer season. The DNA franchise at 10" shows the deepest and most repeated cuts.
- **Not supported:** that this is abnormal. **I have no prior-year baseline.** August 30 is a seasonal clearance moment for a summer-weighted product. A 25–40% cut in late August may be entirely planned. **The -81% DICK'S observation is the only one I would call genuinely alarming on its face**, and even that could be a discontinued colourway.
- **The honest summary: this table is a snapshot without a control.** Its value is as a target list for internal verification, not as a conclusion.

---

## WHERE DEMAND IS PROVEN vs WHERE IT IS INFERRED

### PROVEN (public, quantified, primary-source-backed)
| Claim | Proof |
|---|---|
| Nike's basketball *category* grew through FY26 | Disclosed on Q1 (double-digit) and Q3 (high single digit) earnings calls |
| Adidas basketball is in steep decline | Disclosed -20% Q1 2026, -21% Q2 2026 |
| Adidas *apparel* overall is booming (+33% H1) | Disclosed — so the basketball decline is category-specific, not apparel-wide |
| Nike wholesale is growing, DTC shrinking | Q1 +7% / Q2 +8% wholesale; Q2 DTC -8% |
| Nike is prioritising full-price realisation over volume | Q4 FY26: off-price -50% EMEA, +15pts full-price realisation, guided revenue decline to get margin |
| Greater China is in material decline | Q2 FY26 -17% to $1.42B |
| Nike is the #1 apparel brand on Amazon | Coresight May 2025: 38% of Amazon apparel shoppers |
| WNBA merchandise demand grew violently | +601% store, +500% Fanatics network, +1,000% player merch |
| Under Armour and Puma are both in contraction/reset | UA NA -8%; Puma -9.4% cn Q2 2026 |

### INFERRED (my hypotheses — NOT established)
| Claim | Why it is inferred | What would prove it |
|---|---|---|
| Long inseams (10"/11") are over-bought | 13 markdown observations, no baseline, no volume | Internal sell-through and WOS by inseam |
| Short inseams (5"/6") are under-supplied | **Absence of clearance only. Weak.** | Internal full-price sell-through by inseam + stockout rate |
| The $35–$55 price band is under-occupied | Observed ladder gaps at a snapshot | Internal price-band unit and margin mix |
| Multipack value tier is large and taking Nike units | Amazon assortment shape only — no rank/review data | Circana/NPD share by price band; Amazon ASIN data |
| "Basketball clothing" node = generic comfort bottoms | One rank observation, two rival explanations | Amazon node audit + Nike's own Amazon ASIN data |
| Women's basketball *shorts* are under-served | Growth evidence is jersey/tee-shaped; shorts unnamed | Internal women's basketball shorts unit trend |
| Signature-tier shorts ($90) lack pricing power | One observation (LeBron -25%) | Internal full-price sell-through by tier |
| December is the true annual demand peak | Low-confidence secondary Trends aggregation | Internal weekly POS by week-of-year |

### Where the two disagree — the most important line in this report
**Nike's basketball category grew. Nike's basketball shorts are on deep markdown at four retailers.** These are not contradictory — basketball category growth is footwear-led, and shorts can be clearing hard inside a growing category. **But nothing public can tell you which is happening.** That single question — *is basketball shorts full-price sell-through rising or falling inside a growing basketball category?* — is the reason the internal data request below exists.

---

## TENSIONS

**T1 — Growth narrative vs clearance reality.** Nike tells investors basketball is a growth engine; the clearance racks tell a story of core basketball shorts moving at 37–81% off. Both can be true. Publicly, they cannot be reconciled. *Unresolved.*

**T2 — Margin mandate vs volume defence.** Nike has committed publicly to fewer markdowns, tighter buys and accepted revenue decline. But basketball shorts' mass-market volume is under attack from $10-per-short multipacks. **Tightening the buy on core shorts protects margin and surrenders units.** Surrendering units in an entry product surrenders the consumer's *first* Nike purchase. This is a genuine strategic trade with no free answer.

**T3 — Wholesale-led marketplace vs innovation-led product.** Wholesale rewards simple, forecastable, six-months-ahead line plans. The Sport Offense reorganisation and Aero-FIT-style innovation reward newness and complexity. Basketball shorts sit right where these collide.

**T4 — Signature storytelling vs commodity price.** A $90 LeBron short discounting at the same rate as a $30 Icon suggests the consumer does not currently pay a signature premium for *shorts*, even where they clearly do for footwear ($140 Caitlin 1). Nike's basketball apparel premium strategy may be borrowing credibility that shorts cannot hold.

**T5 — Women's demand proven in fan merch, unproven in performance shorts.** The WNBA numbers are spectacular and jersey/tee-shaped. Building a women's performance shorts investment case off fan-merch growth is a category error waiting to happen — but so is ignoring the most explosive demand signal in basketball.

**T6 — Adidas retreat as opportunity vs as warning.** Adidas basketball -21% inside a +14% company could mean the shelf is opening. It could equally mean the *basketball apparel shelf itself* is contracting at retail and Adidas is simply the first to feel it. Same data, opposite conclusions.

---

## OPPORTUNITIES

### OPPORTUNITY 1 — The Multipack Answer: a Nike-credible 2-pack at a defensible unit price
| | |
|---|---|
| **Target consumer** | US mass-market male, 16–34, buys shorts as consumable basics for gym/hoops/lounge; currently converts to $25–$30 3-packs on Amazon and Walmart |
| **Job to be done** | "I need several pairs of shorts I don't have to think about, and I refuse to pay $30 each." |
| **Product problem** | Nike's entry short (Icon, $30) is a 3x unit-price multiple versus the multipack. Nike wins the single-purchase brand decision and loses the *replenishment* decision entirely — the decision that actually generates volume and habit. |
| **Proposed solution** | A Nike Dri-FIT 2-pack at $45–$50 ($22–$25/short), sold on Amazon and mid-tier wholesale only, deliberately *not* on Nike.com. Two colourways per pack (one black, one seasonal), one inseam per pack, simplified trim. Explicitly positioned as replenishment, not as the hero. |
| **Key features** | Dri-FIT; side pockets (the single most-cited feature in top Amazon listings); one length per SKU to kill size-choice friction; recycled poly to protect the sustainability story at a low cost point |
| **Suggested price position** | **$45 for 2 ($22.50/unit)** — a ~2.2x premium to the value multipack, roughly half the gap Nike carries today |
| **Evidence** | Amazon best-selling athletic shorts are multipack-dominated (BOOJO, Real Essentials, NY Threads); $25–30 band is the populated zone; Nike already #1 apparel brand on Amazon at 38% purchase penetration with zero merchandising; Nike's Amazon store already includes basketball |
| **Confidence** | **Medium.** Assortment shape is well-observed; the size of the multipack business is NOT — I obtained no rank or review data |
| **Key unanswered question** | **Is a Nike multipack accretive or purely cannibalistic?** If the buyer of a $45 2-pack would otherwise have bought two $30 singles, this destroys $15 of revenue per transaction. This is answerable only with internal basket and price-elasticity data. **Do not proceed without it.** |

---

### OPPORTUNITY 2 — Rebalance the inseam ladder against actual sell-through, and stop guessing
| | |
|---|---|
| **Target consumer** | Serious and recreational players across the age split — the sub-25 player who has moved to shorter inseams, and the 30+ player who has not |
| **Job to be done** | "I want a short that reads as *current*, in the length I actually wear, and I want my size to be there." |
| **Product problem** | Observed clearance is concentrated in 10"/11". Nike carries 6/8/10/11 across two franchises — plausibly more length SKUs than the demand curve supports, with the buy weighted to the wrong end. |
| **Proposed solution** | Collapse to **three lengths (6" / 8" / 10")** across a single unified core franchise. Reweight units toward the shorter end *only to the degree internal sell-through supports it*. Free the SKU count to fund colour and size depth instead of length proliferation. |
| **Key features** | One franchise, three lengths, deeper size and colour depth per length; consistent fit block across lengths so the consumer learns one size |
| **Suggested price position** | Hold $30–$35 opening / $45–$50 core. Do not raise price into a value-pressured market. |
| **Evidence** | 13 observed markdowns concentrated at 10"/11"; Nike DNA + Icon both carry 6/8/10/11; Amazon best-sellers offer 5"/7"/9" and 9"/11" — a *narrower* ladder per brand |
| **Confidence** | **Low-Medium.** The over-investment read on long inseams is plausible; the under-supply read on short inseams rests on absence of evidence and could be flatly wrong |
| **Key unanswered question** | **What is full-price sell-through and weeks-of-supply by inseam, by region, over eight quarters?** Without this the entire opportunity is a guess. Agent 04 cannot answer it and neither can any public source. |

---

### OPPORTUNITY 3 — Close the $35–$55 gap with a genuine mid-tier performance short
| | |
|---|---|
| **Target consumer** | The committed recreational player, 18–30, who plays 2+ times a week, knows product, and finds $30 Icon insufficiently technical and $60+ DNA/LeBron unjustifiable |
| **Job to be done** | "Give me the short that real players wear, at a price that isn't a statement." |
| **Product problem** | Observed ladder is thin between $35 and $55. Consumers stepping up from Icon face a large jump and, per observation #11, the premium tier is itself discounting at 25% — which teaches the consumer to wait rather than to trade up. |
| **Proposed solution** | A single, tightly-merchandised **$45** performance short with one visible, nameable technical benefit — not a feature list. Held at full price with disciplined buy depth; never placed into standing sale surfaces. |
| **Key features** | One flagship benefit (ventilation zoning, or an Aero-FIT-derived construction — Nike has stated Aero-FIT moves from football into running apparel in fall 2026, so an apparel-tech pipeline exists); secure pockets; one length focus |
| **Suggested price position** | **$45, defended.** The entire point is full-price discipline. |
| **Evidence** | Observed price ladder gap; LeBron $90 at -25% and adidas Crazylight $80 at -40% both indicate weak premium-tier price-holding; Nike's stated corporate mandate is full-price realisation (+15pts EMEA) |
| **Confidence** | **Low-Medium.** The ladder gap is observed at one snapshot from partial data |
| **Key unanswered question** | **Is the $35–$55 gap a real assortment hole or an artifact of what happened to be on sale on 2026-08-30?** A full-price line-plan review answers this immediately and internally. |

---

### OPPORTUNITY 4 — Build the women's basketball shorts assortment behind the Caitlin Clark apparel launch, as a participation product
| | |
|---|---|
| **Target consumer** | Girls and women who *play* — HS/collegiate/rec — plus the large adjacent fan buyer created by the WNBA surge |
| **Job to be done** | "I want basketball shorts made for my body and my game, not a men's short in a smaller size." |
| **Product problem** | The documented WNBA commercial explosion has been captured almost entirely by jerseys, tees and player merch. Across every source I found, **shorts were never named** — including in the Caitlin Clark apparel rollout, which is described as tee → hoodie → pants → premium apparel. |
| **Proposed solution** | A dedicated women's basketball shorts line built on a women's fit block (not a graded men's block), launched into the Caitlin 1 window (footwear 2026-10-01) so it inherits the marketing spend rather than requiring its own. |
| **Key features** | Women's-specific rise and fit; two lengths; genuinely functional pockets (a persistent, well-documented complaint in women's athletic bottoms); team-orderable colourways to reach the participation channel |
| **Suggested price position** | **$40–$50**, matching men's core — deliberately *not* discounted as a "women's version" |
| **Evidence** | WNBA merch +601% / Fanatics network +500% / player merch +1,000%; attendance +48%, highest in 22 years; Front Office Sports: $4B women's sports merch market is "a supply desert"; Nike Caitlin 1 launching 2026-10-01 at $140 with a full apparel line and a reported $28M deal |
| **Confidence** | **Medium.** The demand signal is strong and well-documented; **that it extends to performance shorts is inferred, and the freshest verified merch figures I could reach are from the 2024 season** |
| **Key unanswered question** | **Is women's basketball demand participation-driven or fandom-driven?** Fan demand buys jerseys and tees. Only participation demand buys performance shorts. Nike knows this from its own units; the public record does not. |

---

### OPPORTUNITY 5 — Contest Adidas basketball apparel shelf space while it is retreating
| | |
|---|---|
| **Target consumer** | Not a consumer — the US mid-tier wholesale buyer (DICK'S, Academy, Hibbett, Kohl's) planning Spring/Summer 2027 |
| **Job to be done** | (Buyer's) "I have basketball shorts space allocated to a brand whose basketball business fell 21% and I need it to produce." |
| **Product problem** | Space is contestable *now*, in the FY27 wholesale booking window, and the window closes. Nike is simultaneously growing wholesale (+8%) and tightening buys — a tension that could cause it to miss the moment. |
| **Proposed solution** | A wholesale-first basketball shorts offer engineered for the buyer's economics: simplified line, strong opening price point, guaranteed full-price sell-through support, and clear length rationalisation — sold on *margin certainty*, which is precisely what a buyer burned by a -21% brand and by -81% clearance wants. |
| **Key features** | Narrow, forecastable line; disciplined length ladder; no mid-season assortment churn; replenishable core colours |
| **Suggested price position** | Opening $30 / core $45 — matching observed ladder, with markdown-support terms as the differentiator |
| **Evidence** | Adidas basketball -20%/-21% inside a +14% company, "transitional phase," recovery plan named as *footwear* not apparel; adidas Crazylight observed at -40%; Nike wholesale +7%/+8% and explicitly prioritised |
| **Confidence** | **Medium-High on the Adidas weakness** (directly disclosed); **Low on whether the shelf is winnable** — I have no share-of-shelf or door-level data |
| **Key unanswered question** | **Is the basketball shorts shelf at US mid-tier growing, flat, or shrinking in total?** If it is shrinking, taking share of a contracting shelf is a poor use of investment. Public data cannot see this. Circana/Nielsen point-of-sale can. |

---

## THE INTERNAL DATA REQUEST
*Prioritised. Each entry: the dataset — the question it answers — the decision it unlocks. Items 1–4 are the ones that convert this report from hypothesis into direction.*

### TIER 1 — Blocking. Nothing below Opportunity level can be decided without these.

**1. Basketball shorts full-price sell-through and weeks-of-supply, by inseam length, by franchise, by region, 8 quarters.**
- *Answers:* Is the 10"/11" markdown concentration over-investment, or planned end-of-life? Is 6" actually selling out, or just bought small?
- *Unlocks:* Opportunity 2 in full, and the length weighting of the entire FY28 buy. **This is the single highest-value dataset in this report.** Every length hypothesis I have collapses or confirms on this one table.

**2. Basketball shorts units, revenue, and gross margin by price band ($0–30 / $30–45 / $45–60 / $60+), 8 quarters, US and global.**
- *Answers:* Is the $35–$55 band genuinely under-occupied? Where is margin actually earned? Is the premium tier holding price?
- *Unlocks:* Opportunities 1 and 3. Confirms or kills the ladder-gap thesis in an afternoon.

**3. Markdown and off-price disposition report for basketball shorts: units and margin by style, length, channel, and *weeks-on-markdown*, vs FY25 baseline.**
- *Answers:* **Is what I observed on 2026-08-30 abnormal, or is it ordinary end-of-summer clearance?** My table has no control. This is the control.
- *Unlocks:* Whether Signal 3 is a finding or a false alarm. Without this, Opportunity 2 should not be funded.

**4. Amazon ASIN-level performance for Nike basketball shorts since the Q1 FY26 relaunch: units, price realisation, review velocity, conversion, and competitive share-of-search vs multipack sellers.**
- *Answers:* How large is the value/multipack tier really, and does Nike convert against it at any price? Also resolves Signal 6 — is the "basketball clothing" node a taxonomy artifact or a consumer truth?
- *Unlocks:* Opportunity 1 entirely. **Nike now has this data first-party and did not before 2025.** It is the newest and most under-exploited commercial instrument in the category.

### TIER 2 — Directional. Needed to size and sequence.

**5. Women's basketball shorts units, sell-through and returns, FY24→FY26, split participation channel (team/institutional) vs retail.**
- *Answers:* Is women's basketball demand participation-driven or fandom-driven?
- *Unlocks:* Opportunity 4, and whether it is a $-millions or $-tens-of-millions play.

**6. Weekly POS by week-of-year for basketball shorts, 3 years, US and EMEA.**
- *Answers:* Are there genuinely three demand peaks (April / June / December)? Is December really the annual high?
- *Unlocks:* Buy timing, flow calendar, and whether the December gifting peak justifies a distinct holiday-gift short/pack.

**7. Size-level stockout and lost-sales estimate by style and length, 8 quarters.**
- *Answers:* The question I could not touch at all — where is Nike actually selling out?
- *Unlocks:* The entire under-supply side of the thesis, which currently rests on absence of evidence.

**8. Rebuy / repeat-purchase rate for basketball shorts buyers at 6 and 12 months, by entry price point.**
- *Answers:* Does the $30 Icon buyer come back? Does the multipack-equivalent buyer come back more or less?
- *Unlocks:* Whether Opportunity 1 is accretive or cannibalistic — the question that gates it.

### TIER 3 — Contextual.

**9. Door-level share-of-shelf for basketball shorts at US mid-tier wholesale, Nike vs Adidas vs UA vs private label, 4 seasons.** — Answers whether the Adidas retreat is real space or a shrinking shelf. Unlocks Opportunity 5.

**10. Circana/Nielsen US basketball shorts category POS: total category size, growth, and brand share by price band.** — Answers the one thing no Nike-internal dataset can: is the *category* growing? Technically third-party, but Nike licenses it.

**11. Basketball shorts return rate and return-reason codes by length and fit block.** — Fit and length problems surface in returns before they surface in sell-through.

**12. Signature/premium basketball apparel ($60+) full-price sell-through vs footwear equivalent.** — Answers Tension T4: does the consumer pay a signature premium for shorts at all?

---

## FULL SOURCE LIST

*All accessed 2026-08-30 via web search result summaries. **No primary document was directly loadable this session** — see Methodology.*

### Nike corporate / investor
1. NIKE, Inc. Form 10-K FY2026 (nke-20260531.htm), filed ~July 2026 — sec.gov/Archives/edgar/data/0000320187/000032018726000088/nke-20260531.htm — *blocked; summary only; contains the unreconciled footwear/apparel figures*
2. NIKE, Inc. Q4 FY26 earnings call transcript, 2026-06-30 — s1.q4cdn.com/806093406/files/doc_financials/2026/q4/ — *blocked*
3. NIKE, Inc. Reports Fiscal 2026 Fourth Quarter and Full Year Results, 2026-06-30 — investors.nike.com — *blocked*
4. NIKE, Inc. Reports Fiscal 2026 Third Quarter Results, 2026-03-31 — investors.nike.com
5. NIKE, Inc. Reports Fiscal 2026 Second Quarter Results, 2025-12-18 — investors.nike.com
6. NIKE, Inc. Reports Fiscal 2026 First Quarter Results, 2025-09-30 — investors.nike.com
7. Nike (NKE) Q3 2026 Earnings Call Transcript, 2026-04-01 — fool.com
8. Nike (NKE) Q2 2026 earnings, 2025-12-18 — cnbc.com/2025/12/18/nike-nke-q2-2026-earnings.html
9. Nike (NKE) Q1 2026 earnings, 2025-09-30 — cnbc.com/2025/09/30/nike-nke-q1-2026-earnings.html
10. Nike Inc Q4 2026 Earnings Call Highlights, 2026-06/07 — finance.yahoo.com
11. Nike's Reset Under Elliott Hill Tests Core Sports And Investor Patience, 2026 — finance.yahoo.com
12. Nike's CEO of Sport is Taking the Swoosh Back to Its Roots — about.nike.com/en/magazine/elliott-hill-ceo-of-sport-interview
13. Nike names brand president, executive leadership restructure — retaildive.com/news/nike-names-brand-president-executive-leadership-restructure/747246/
14. How Nike's CEO plans to turn the company around by focusing on sports, 2025-10-07 — axios.com/local/portland/2025/10/07/

### Nike / Amazon
15. Nike to resume selling directly on Amazon for first time since 2019, 2025-05-21 — cnbc.com/2025/05/21/nike-to-resume-selling-directly-on-amazon-for-first-time-since-2019.html
16. Amazon is 'working directly with Nike to source their products' — modernretail.co/operations/
17. Nike says it's making progress with its wholesale turnaround as it readies for its return to Amazon — modernretail.co
18. Coresight Research Amazon apparel shopper survey, May 2025 (cited in above) — Nike #1 apparel brand, 38% penetration
19. All the Retailers Nike Left & Then Returned — wwd.com/footwear-news/shoe-industry-news/lists/nike-wholesale-strategy-amazon-dtc-retail-return-1237809601/

### Competitors
20. adidas grows top line 14% and achieves record sales in Q2, 2026-07 — adidas-group.com/en/media/press-releases/adidas-grows-top-line-14percent-and-achieves-record-sales-in-q2
21. adidas records strong start to the year in Q1 2026 — adidas-group.com/en/media/press-releases/
22. Adidas Q2 2026 slides: World Cup fuels record sales, margins pressured — investing.com
23. Adidas Q1 Earnings 2026: Beats Market Expectations, 14% Growth — wwd.com/business-news/financial/
24. Under Armour Reports Fourth Quarter and Full-Year Fiscal 2026 Results, 2026-05 — prnewswire.com/news-releases/under-armour-reports-fourth-quarter-and-full-year-fiscal-2026-results-provides-initial-fiscal-2027-outlook-302768815.html
25. Under Armour revenue falls to five billion dollars amid strategic reset, 2026-05-12 — fashionunited.com
26. UNDER ARMOUR REPORTS THIRD QUARTER FISCAL 2026 RESULTS — prnewswire.com
27. PUMA Q2 2026 reflects reset measures and softer demand, 2026-07-31 — about.puma.com/en/newsroom/corporate-news/2026/31-07-2026-puma-q2-2026-reflects-reset-measures-and-softer-demand
28. Puma Q2 H1 Earnings 2026: Reset sees Sales Slide, Losses Narrow — wwd.com
29. EXEC: Puma Narrows Q2 Loss, Sales Slump 9 Percent — sgbonline.com
30. Anta Sports Q2 2026 results: brand growth slows — sgieurope.com/financial-results/anta-brand-growth-stalls-as-ceo-exits/122253.article
31. ANTA Sports Faces Inventory Pressure with 136-Day Turnover Cycle; LI NING Reports Third Consecutive Year of Profit Decline — itiger.com/news/1141085937
32. Li Ning Company Limited Announces 2026 Interim Results, 2026-08 — panafricanvisions.com

### Retail pricing observations (2026-08-30)
33. Sale Basketball Shorts — nike.com/w/sale-basketball-shorts-38fphz3glsmz3yaepz5k5r2
34. Sale Under $25 Basketball Shorts — nike.com/w/sale-under-25-basketball-shorts-2ylu5z38fphz3glsmz3yaep
35. Men's Dri-FIT Basketball Shorts — nike.com/w/mens-dri-fit-basketball-shorts-32dxrz38fphz3glsmznik1
36. Nike DNA Men's Dri-FIT Basketball Shorts — nike.com/t/dna-mens-dri-fit-basketball-shorts-hVGm16
37. Nike Dri-FIT Icon Men's Basketball Shorts — nike.com/t/dri-fit-icon-mens-basketball-shorts-2c8F76
38. Sale Nike Basketball Shorts — footlocker.com/category/sport/basketball/sale/clothing/nike/shorts.html
39. Sale Basketball Shorts — footlocker.com/category/sport/basketball/sale/clothing/shorts.html
40. Clearance Basketball Shorts — goinggoinggone.com/f/clearance-basketball-shorts
41. Men's Nike Basketball Shorts — dickssportinggoods.com/f/nike-basketball-shorts
42. Nike Shorts on Clearance — kohls.com/catalog/clearance-nike-shorts-bottoms-clothing.jsp

### Marketplace / demand proxies
43. Amazon Best Sellers: Best Men's Basketball Clothing (node 2419328011) — amazon.com/Best-Sellers-Men's-Basketball-Clothing/zgbs/fashion/2419328011
44. Amazon Best Sellers: Best Men's Athletic Shorts (node 1046660) — amazon.com/Best-Sellers-Men's-Athletic-Shorts/zgbs/fashion/1046660
45. Amazon: Mens Basketball Shorts Multipack — amazon.com/mens-basketball-shorts-multipack/
46. Nike x NOCTA Basketball Shorts (SS22) — stockx.com/nike-x-nocta-basketball-shorts-black *(existence of resale market only; no pricing obtained)*
47. NOCTA Shorts — nocta.com/collections/shorts

### Women's basketball
48. SBJ: WNBA garners record sales across Fanatics network — fanaticsinc.com/news/sbj-wnba-garners-record-sales-across-fanatics-network
49. WNBA Delivers Record-Setting 2024 Season — wnba.com/news/wnba-delivers-record-setting-2024-season
50. WNBA: Record TV Ratings, 756 Percent Merch Sales Uptick, Highest Attendance in 26 Years — athleticbusiness.com
51. The $4 Billion Women's Sports Merch Market Is a Supply Desert — frontofficesports.com/womens-sports-merchandise-market-4-billion/
52. Nike unveils Caitlin Clark's new logo with signature shoe, full apparel line set for 2026 release — cbssports.com/wnba/news/
53. Caitlin Clark Nike Signature Shoe Rumored for Holiday 2026 Release, 2026-04 — hypebeast.com/2026/4/
54. Caitlin Clark's New Nike Signature Apparel is Available Now — soleretriever.com/news/articles/

### Market sizing (third-party, low confidence)
55. Basketball Apparel Market Size, Competitors & Forecast — researchandmarkets.com/report/basketball-wear
56. Basketball Clothes Market: Opportunities, Growth & Forecast Analysis — marketresearchintellect.com
57. Global Sports Shorts Market Trends and Opportunities for Growth — datainsightsreports.com/reports/global-sports-shorts-market-74494

### Fanatics
58. Fanatics revenue, valuation & funding — sacra.com/c/fanatics/
59. Fanatics Turns Its Rewards Program Into a Direct Revenue Stream, 2026 — sportico.com/business/commerce/2026/fanatics-one-rewards-program-revenue-1234889543/

### Seasonality (low confidence)
60. Basketball short trends 2025: Mesh & Compression Styles — accio.com/business/basketball-short-trends
61. Trending NBA Mesh Shorts 2026 — accio.com/business/trending-nba-mesh-shorts-2026

---

## CLOSING NOTE ON RELIABILITY

Three things in this report I would defend without reservation: the Nike-vs-Adidas basketball divergence, Nike's public commitment to margin over volume, and the WNBA demand explosion. All three are direct company or league disclosures.

One thing I would defend with caution: the markdown table. The prices are real; the interpretation has no baseline.

Two things I explicitly failed to deliver, and no reader should assume otherwise: **Amazon review-count and rank data** (the brief's central demand proxy) and **any sell-out, stockout or resale-premium evidence whatsoever.** Both were blocked by infrastructure, not by absence in the world. Both are recoverable in a few hours with working network access, and both would materially change the confidence on Opportunities 1 and 2.

The most valuable single sentence I can leave: **Nike's basketball category is growing and Nike's basketball shorts are deeply marked down, and no public source on earth can tell you whether those two facts are in tension. Dataset #1 can.**
