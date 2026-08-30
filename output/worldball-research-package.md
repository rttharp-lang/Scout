# Basketball Apparel — Product Research Package
## ⚠️ DESK RESEARCH EDITION — EXTERNAL SOURCES ONLY

**Date:** 30 August 2026
**Prepared under:** GRAPH SPEC (Basketball Apparel opportunity), modified scope
**Status:** Complete within a materially reduced evidence base. Read §0 before anything else.

---

# §0. READ THIS FIRST — what this package is and is not

The spec called for a decision-grade package built on a `/data` corpus spanning VOC,
marketplace, product, commercial, and internal-knowledge sources. **That corpus does not
exist in this environment.** A full filesystem sweep found zero source documents (see
`gaps-and-judgment-calls.md` §2 for the audit).

You elected to proceed with **desk research** instead. So:

| | Standard package | **This package** |
|---|---|---|
| VOC (reviews, returns, NSRL, NDDC) | Primary input | **None.** No proprietary consumer data. |
| Commercial (POS, margin, bookings, rebuy) | Primary input | **None.** Public earnings only. |
| Key account (KAPE, sell-through) | Primary input | **None.** Retailer public filings only. |
| Product architecture (own catalog, lifecycle) | Primary input | **None.** Public catalog observation only. |
| Market Loop output | Input + benchmark | **Absent.** |
| External (competitive, participation, culture) | Supporting input | **The entire evidence base.** |

**What this means for the investment review.** Every number here is publicly available to
every competitor. There is no proprietary insight in this document, because no proprietary
data was available to generate one. **No sizing figure here is margin-bearing** — the
public market-size estimates are weak (see F-04.1 and its skeptic pass), and there is no
cost, margin, or elasticity data of any kind. Treat this as a **hypothesis set for the
PLM to test against internal data**, not as an investment case that can be approved on its
own. Where it is genuinely useful is direction-setting and knowing which internal queries
to run first — §7 makes that explicit.

Judged against a Market Loop outcome built on the real corpus, this package should be
expected to lose on insight quality and completeness. It is offered as the honest
maximum available from public sources, not as an equivalent product.

**Client identity — inferred, not given.** The repository contains a Nike brand mark, and
the spec's acronyms (NSRL, NDDC, KAPE) are Nike-internal. Research was therefore gathered
Nike-centrically. This is judgment call **J5**; if wrong, the competitive and geographic
sections need re-running.

---

# §1. Domain coverage — what ran, what was cut

The spec permits cutting domains where the data isn't there, and requires saying so.
Applied to an external-only evidence base:

| # | Domain | Verdict | Basis |
|---|---|---|---|
| 01 | Consumer Voice | **CUT** | Needs reviews, returns coding, NSRL, NDDC. All proprietary. Nothing public substitutes. |
| 02 | Key Account | **PARTIAL** | KAPE and sell-through absent. Recovered signal from Dick's / Foot Locker SEC filings. |
| 03 | Competitive | **RAN** | Public filings, IR releases, trade press. Strongest external domain. |
| 04 | Market Sizing | **PARTIAL — LOW** | Only third-party aggregator estimates available. Quality is poor; see skeptic pass. |
| 05 | Product Architecture | **CUT** | Needs own catalog master, attribute taxonomy, lifecycle. All proprietary. |
| 06 | Price Point | **PARTIAL — LOW** | Shelf prices observable; elasticity and feature-cost maps are not. |
| 07 | Commercial | **PARTIAL** | No POS/margin/bookings. Recovered channel-mix signal from the FY26 10-K. |
| 08 | Athlete & On-Court | **CUT** | Needs athlete feedback loops and performance testing. Merged remnant into 03. |
| 09 | Culture & Social | **RAN — LOW** | Ran, then largely demolished by skeptic. See §3 F-09.1. |
| 10 | Participation | **RAN** | SFIA 2026 Topline is public and credible. |
| 11 | Geo: Greater China | **RAN** | Unusually well covered publicly. |
| 12 | Geo: EMEA + APLA | **CUT** | No usable region-specific basketball demand data found. Logged as gap. |
| 13 | Women's Basketball | **RAN** | Best-evidenced domain in the package. |
| 14 | Youth | **RAN** | Piper Sandler teen survey is public, large-n, longitudinal. |
| 15 | Strategy Alignment | **PARTIAL** | Market Loop absent. Recovered public strategy (Sport Offense) as a partial substitute. |

**Ran or partial: 10 of 15. Cut outright: 5 of 15** (01, 05, 08, 12, and effectively the
Market Loop half of 15).

Critically, **the three cut domains 01, 05, and 07-proper are the ones that carry consumer
truth and profitability.** A package without them can identify where demand is, but cannot
say what our consumers actually complain about, what we already sell, or whether serving
that demand makes money. That is the structural limitation of everything below.

---

# §2. Method

Tier 1 specialists were run as scoped research passes over public sources; Tier 2
orchestration (opportunity → product → risk → chief ranking) was run as specified. The
skeptic layer was retained in full and is the most important part of this package —
with a thin evidence base, adversarial review is what separates signal from SEO noise.
It did real damage: it downgraded or killed findings in four domains, including one that
would otherwise have read as a headline opportunity (§3, F-09.1).

**Every finding carries:** ID · source · date · data type · OBSERVED vs INFERRED ·
confidence with reasoning · skeptic disposition.

---

# §3. Surviving findings by domain

## Domain 03 — COMPETITIVE

**F-03.1 · Anta is now the largest sportswear brand in China and still compounding.**
RMB 80.22bn FY2025 revenue, +13.3% YoY, ~21.8% share of China sportswear.
*Source:* Anta Sports IR release, FY2025 results · *Type:* EXTERNAL · **OBSERVED**
**Confidence: HIGH** — audited company results from primary IR channel.
*Skeptic tried:* the 21.8% share figure is attributed to an unnamed "internationally
recognized institution" in Anta's own release — self-serving and unverifiable.
*Why it didn't land:* the revenue and growth figures are audited and independently
sufficient to establish market leadership. **The share figure is downgraded to MED and
should not be quoted externally; the leadership conclusion survives on revenue alone.**

**F-03.2 · Li-Ning's basketball business contracted sharply in 2025 while its basketball
footwear recovered.** Basketball retail sales −19%, attributed to market weakness plus
deliberate inventory control; basketball footwear returned to double-digit growth. Group
revenue RMB 27.0bn, −6.6%. 2026 guidance: high-single-digit revenue growth.
*Source:* Li-Ning FY2025 results coverage · *Type:* EXTERNAL · **OBSERVED**
**Confidence: MED** — figures are from results coverage, not the primary filing, and one
retrieved source reported "296 billion yuan, +3.2%," which is internally inconsistent with
every other figure and is a transcription error (RMB 29.6bn scale). **Verify against
Li-Ning's own annual report before use.**
*Skeptic tried:* a −19% basketball decline that management attributes partly to its own
inventory control is not a clean demand signal.
*Why it partly landed:* correct. Cause is genuinely mixed between demand weakness and
self-inflicted destocking, and **we cannot separate them from public data.** This
ambiguity is load-bearing for OS-3 and is flagged as **judgment call J2**.

**F-03.3 · adidas has rebuilt a credible basketball franchise on a single athlete.**
The Anthony Edwards AE1 (Nov 2023) became one of the highest-selling signature basketball
shoes in the league; AE2 launched 2026; Edwards extended for a reported ~$50m; the line is
central to adidas's North America expansion, with deliberate China market-building.
*Source:* Forbes (May 2026), Business of Fashion, trade press · *Type:* EXTERNAL · **OBSERVED**
**Confidence: MED-HIGH** — multiple independent outlets; the "$50m" and "highest-selling"
claims are press-reported, not disclosed.
*Skeptic tried:* signature footwear success does not transfer to apparel, which is what
this package is about.
*Why it partly landed:* correct and important. **F-03.3 is retained as evidence of
competitive intent and halo, not as an apparel demand signal.** It informs risk (§5), not
opportunity sizing.

## Domain 11 — GEO: GREATER CHINA

**F-11.1 · Nike's Greater China business is at an eight-year low and still falling.**
FY26 Greater China revenue −13% currency-neutral; roughly −30% from the 2021 peak.
Footwear −15% with units −14%; Nike Direct −12%; **digital −29%.**
*Source:* Nike FY2026 Form 10-K (SEC); CNBC, 29 Jul 2026 · *Type:* EXTERNAL · **OBSERVED**
**Confidence: HIGH** — SEC-filed audited figures.
*Skeptic tried:* nothing landed. Primary-source filing.

**F-11.2 · The China loss is structural and competitive, not cyclical.**
A government-backed "China Chic" movement has shifted younger consumers toward Anta and
Li-Ning; simultaneously On, adidas, Salomon, Hoka and Kailas have taken specific
territory. Nike is cutting online distributors and moving to design product specifically
for Chinese consumers.
*Source:* WWD, CNBC, WSJ-adjacent trade coverage, Jul 2026 · *Type:* EXTERNAL · **INFERRED**
**Confidence: MED** — the individual competitor facts are observed; "structural not
cyclical" is an inference from their convergence.
*Skeptic tried:* four years of decline could still be brand-cycle rather than structural.
*Why it didn't land:* the −29% digital collapse alongside an active distributor cull
indicates channel and consumer-preference change, not a product-cycle trough. Inference
retained but explicitly labelled.

## Domain 10 — PARTICIPATION

**F-10.1 · US team-sport participation is at an all-time high; basketball is a leading
youth sport.** Team sports passed 90 million participants for the first time in SFIA's
tracking history. Overall participation +1.2% YoY; CORE participation 158.8m, +1.3%.
Basketball, baseball and outdoor soccer lead across youth age groups.
*Source:* SFIA 2026 Topline Participation Report · *Type:* EXTERNAL · **OBSERVED**
**Confidence: HIGH** — the industry-standard participation instrument, large-n, longitudinal.
*Skeptic tried:* SFIA is an industry trade association with an interest in reporting growth.
*Why it didn't land:* SFIA reports unfavourable findings in the same release (F-10.2,
F-10.3), which is inconsistent with systematic optimism bias.

**F-10.2 · Teen inactivity is rising — the only age group moving the wrong way.**
Inactivity declined in every age group except 13-17, where it **rose 4.4% YoY.**
*Source:* SFIA 2026 Topline · *Type:* EXTERNAL · **OBSERVED** · **Confidence: HIGH**
*Skeptic tried:* one year is not a trend.
*Why it partly landed:* fair. **Treated as a live signal requiring confirmation next wave,
not an established trend.** It is a risk input, not an opportunity basis.

**F-10.3 · The female participation gap is widening.** Women remain more likely than men
to be inactive, gap widening to 6.3pp from 5.9pp.
*Source:* SFIA 2026 Topline · *Type:* EXTERNAL · **OBSERVED** · **Confidence: HIGH**
*Skeptic tried:* this **contradicts** the women's-basketball opportunity in Domain 13.
*Why it didn't land — and this is the key analytic point in the package:* it does not
contradict it, it sharpens it. General female physical inactivity rising while female
basketball *fandom and merchandise demand* explode (F-13.1-3) means **the women's
opportunity is substantially fan/culture-led, not participation-led.** That distinction
changes the product answer — see §4 OS-1 and the Concept 1 design.

## Domain 13 — WOMEN'S BASKETBALL

**F-13.1 · Women's basketball merchandise demand has stepped up an order of magnitude.**
WNBA merch +601% online and +233% at Dick's in 2024 vs 2023; league-wide merch >+500%
since the start of 2024, with jersey sales >+1,000%.
*Source:* WNBA official 2024 season release; trade coverage · *Type:* EXTERNAL · **OBSERVED**
**Confidence: MED-HIGH** — league-official for the 2024 figures; the +500%/+1,000% figures
are trade-reported.
*Skeptic tried:* percentage growth off a tiny base is not a business. A 601% increase on a
small denominator can be commercially trivial.
*Why it partly landed:* **entirely correct, and the base is not disclosed.** The percentages
are retained *only* as evidence of demand-direction and slope. **They must not be used for
sizing.** Absolute sizing is a GAP. This is the single most important caveat in the package.

**F-13.2 · A women's player is now a top-2 jersey in all of US basketball.**
Caitlin Clark's Fever #22 ranked #2 in overall US basketball jersey sales across the WNBA
*and* NBA, behind only Curry — ahead of LeBron, Dončić and Jordan.
*Source:* jersey-sales trade coverage, 2025-26 · *Type:* EXTERNAL · **OBSERVED**
**Confidence: MED** — consistently reported across outlets, but underlying methodology and
retailer scope are not disclosed.
*Skeptic tried:* single-athlete concentration; this is a Clark fact, not a women's-basketball fact.
*Why it partly landed:* correct — **concentration risk is real and is carried into §5 as
R-2.** The finding survives as proof that a women's basketball product can reach top-tier
commercial scale, which was previously unproven.

**F-13.3 · The league's structural capacity is expanding in 2026.**
Portland Fire and Toronto Tempo joined for the 2026 season, taking the league to 15 teams
and adding a first Canadian market; a new CBA materially raises player compensation and
redefines media rights. 2026 viewership +12% YoY, ~742k average per game, 73m viewers by
the All-Star break; 220m hours watched last season, +16% YoY.
*Source:* WNBA.com, CBC, CBS Sports, Barrett Media (Jul 2026) · *Type:* EXTERNAL · **OBSERVED**
**Confidence: HIGH** — league-official and multiply corroborated.
*Skeptic tried:* nothing landed. Two new franchises are a hard, scheduled fact with
associated hard, scheduled merchandise need.

**F-13.4 · Women's basketball is a called-out strength at our largest US wholesale account.**
Dick's cited women's basketball — alongside performance running and retro running — as a
particular strength category in its FY26 Q1.
*Source:* Dick's Sporting Goods FY26 Q1 results / SEC 10-Q · *Type:* COMMERCIAL (public) · **OBSERVED**
**Confidence: HIGH** — SEC-filed, and a retailer naming a strength category against its own
inventory position is a costly signal.
*Skeptic tried:* "women's basketball" at Dick's may be predominantly footwear.
*Why it partly landed:* the split is not disclosed. **Category direction survives;
apparel-specific read is INFERRED.**

**F-13.5 · Women's basketball apparel is built on a men's pattern block, and it doesn't fit.**
Unisex blocks are cut to men's proportions: shoulders ~17-18" vs ~14-15" for a women's cut;
torso 1-2" longer; hips not shaped for waist-to-hip ratio. Documented consequences include
gaping armholes and front ride-up. Nike's own published design work quotes female players
reporting shorts too long, resulting waistband too large, and tops too wide and loose.
Separately: for every nine pieces of men's sports merchandise, roughly one women's piece
is available.
*Source:* apparel-pattern technical sources; Nike design coverage (Fortune); women's
sports apparel market coverage · *Type:* EXTERNAL · **OBSERVED (technical) / MED (9:1 ratio)**
**Confidence: MED-HIGH** on the fit mechanism; **LOW-MED** on the 9:1 availability ratio.
*Skeptic tried:* the Nike player-quote source is old (2016) — stale by nine years.
*Why it partly landed:* **the staleness is a genuine hit and is recorded.** However, the
pattern-block geometry is a physical constant, not a dated observation, and it is
independently sourced. **Retained on the technical evidence; the player quotes are
illustrative only and must be refreshed against current VOC — a named GAP.**

## Domain 14 — YOUTH

**F-14.1 · Clothing is the #1 teen wallet priority for the first time in over a decade,
and we lead it.** Clothing reached 22% of teen wallet share — highest priority since Fall
2014. Nike is the #1 clothing brand and #1 footwear brand among teens. Apparel and footwear
spending grew mid-single-digits, **with female teens leading the growth.**
*Source:* Piper Sandler *Taking Stock With Teens*, 2026 · *Type:* EXTERNAL · **OBSERVED**
**Confidence: HIGH** — large-n (5,690-9,193 respondents per wave), 50 semi-annual waves,
methodologically stable, widely used by the street.
*Skeptic tried:* skews to higher-income US teens; not globally representative.
*Why it partly landed:* correct — **US-only, income-skewed. Scope-limited accordingly.**
Does not support any non-US conclusion.

**F-14.2 · Smaller brands are taking teen share from incumbents.** On overtook Hoka for
the first time in six waves; Shein gained; specialty and emerging brands are capturing
growing share against incumbents.
*Source:* Piper Sandler 2026 · *Type:* EXTERNAL · **OBSERVED** · **Confidence: MED-HIGH**
*Skeptic tried:* the named gainers (On, Hoka, Shein) are running and fast-fashion, not
basketball — irrelevant to this category.
*Why it partly landed:* **substantially correct.** Retained as a general erosion signal at
reduced weight; **it is not basketball-specific evidence** and is not used in sizing.

## Domain 07 / 02 — COMMERCIAL & KEY ACCOUNT (partial)

**F-07.1 · Our channel mix reversed in FY26: wholesale grew, DTC shrank.**
Nike Brand wholesale $25.9bn → **$27.5bn**; Nike Direct $18.8bn → **$17.7bn**, driven by a
traffic decline. Group revenue $46.4bn, flat reported, −2% currency-neutral. Apparel
$15.72bn (33.9% of revenue); footwear $30.54bn (65.8%).
*Source:* Nike FY2026 Form 10-K (SEC) · *Type:* COMMERCIAL (public) · **OBSERVED**
**Confidence: HIGH** — audited, SEC-filed.
*Skeptic tried:* nothing landed.
**Implication:** basketball apparel is a wholesale-led category and wholesale is the
channel currently working. This meaningfully affects go-to-market for §4 concepts.

**F-07.2 · Account health is diverging, and the weakness is footwear-shaped.**
Dick's raised FY26 comp guidance to 2.5-4.0% with broad-based growth. Foot Locker's
proforma comp outlook was cut to **−2.0% to 0.0%**, explicitly attributed to *"greater
exposure to legacy footwear silhouettes and greater dependence on footwear launch and
retro product."*
*Source:* Dick's / Foot Locker FY26 Q1-Q2 SEC filings and IR · *Type:* COMMERCIAL (public) · **OBSERVED**
**Confidence: HIGH** — SEC-filed with management attribution.
*Skeptic tried:* Foot Locker is mid-acquisition-integration by Dick's; comps are noisy.
*Why it partly landed:* integration noise is real, **but management's own stated cause is
product-mix, not integration.** Survives with the caveat noted.

**F-07.3 · Basketball is not separately disclosed in our public reporting.**
Nike reports by product type and geography, not by sport. No public basketball revenue line
exists.
*Type:* COMMERCIAL · **OBSERVED** · **Confidence: HIGH** — verified absence in the 10-K.
**This is why every sizing statement in this package is weak.** Logged as the #1 gap.

## Domain 15 — STRATEGY ALIGNMENT (partial)

**F-15.1 · The company has already reorganised around exactly this thesis.**
"Sport Offense" moved ~8,000 employees into vertically integrated, sport-specific teams —
basketball among them. CEO Elliott Hill's stated diagnosis: Nike drifted toward lifestyle
and fashion, and grows best when rooted in athletic performance and innovation. A Caitlin
Clark signature shoe is publicly confirmed as in progress. Headwinds are guided through
early FY27.
*Source:* Nike IR / CEO remarks; Forbes, Axios, Fox Business, 2025-26 · *Type:*
EXTERNAL proxy for INTERNAL-KNOWLEDGE · **OBSERVED** · **Confidence: MED-HIGH**
*Skeptic tried:* public CEO commentary is positioning, not strategy documentation, and is
no substitute for the actual category strategy or the Market Loop output.
*Why it partly landed:* **entirely correct.** Retained as directional alignment evidence
only. **Domain 15 remains substantially unserved.**
**Note the implication for this package's recommendations:** a Clark signature shoe already
in flight means the women's-basketball thesis is not novel internally. Our contribution is
therefore about **apparel** specifically, and about the fit system — not about discovering
women's basketball, which the organisation has clearly already found.

## Domain 04 — MARKET SIZING (LOW — read the skeptic pass)

**F-04.1 · Public estimates put basketball apparel at roughly $3.8-4.1bn growing ~6% CAGR.**
$3.8bn (2025) → $4.1bn (2026); forecasts of ~5.9-6.5% CAGR to 2029-2034.
*Source:* Technavio, Grand View, IntelMarket, Business Research Company · *Type:* MARKETPLACE · **OBSERVED**
**Confidence: LOW.**
*Skeptic tried:* several things, and they landed hard.
1. These are paywalled-teaser aggregator reports with undisclosed methodology.
2. **The figures are internally incoherent.** One source forecasts growth *of* $6.53bn
   during 2025-2030 on a stated 2026 base of $4.1bn — implying the market more than
   doubles-and-a-half in four years, which is irreconcilable with the same cluster's
   ~6% CAGR claim. The two cannot both be true; they are almost certainly measuring
   different category boundaries without saying so.
3. No source defines whether "basketball apparel" includes licensed/fan merchandise —
   which, given F-13.1, is the fastest-moving part and would swing the number materially.
*Why it didn't land — it did:* **F-04.1 is retained only as an order-of-magnitude anchor
(single-digit billions USD) and is explicitly barred from any investment arithmetic.**
Real sizing requires internal POS and category definitions. **This is the largest single
gap in the package.**

## Domain 06 — PRICE POINT (LOW)

**F-06.1 · Observable retail ladder for basketball shorts.**
Entry $25-35 · mid-tier $36-48 · premium performance $49-65 · authentic/pro-grade at $79.99
(NBA Store, Jordan Statement Edition Swingman short). A commonly cited "value sweet spot"
sits at $38-45.
*Source:* retailer sites (Dick's, NBA Store) plus buying-guide content · *Type:* MARKETPLACE · **OBSERVED / partly INFERRED**
**Confidence: LOW-MED.** The $79.99 authentic price is directly observed at retail; the
tier boundaries and "sweet spot" derive from commercial buying-guide content of low
evidentiary quality.
*Skeptic tried:* the ladder sources are affiliate/SEO commerce content, not price research;
and **no elasticity data exists at all** — a price ladder is not a demand curve.
*Why it landed:* accepted. **Ladder retained as shelf-price orientation only. No
elasticity claim is made anywhere in this package.**

## Domain 09 — CULTURE & SOCIAL (LOW — largely demolished)

**F-09.1 · [DOWNGRADED] Reported shift toward retro/baggy basketball silhouettes crossing
into streetwear.** Reported themes: vintage/retro shorts revival, oversized silhouettes,
colour-blocking and retro stripe detail, basketball shorts as everyday streetwear.
*Source:* fashion-trend and commerce-blog content, 2026 · *Type:* EXTERNAL · **INFERRED**
**Confidence: LOW.**
*Skeptic tried:* and this one broke.
1. Sources are SEO/affiliate content farms (accio.com, anarchylabel.com, rumbie.co,
   fashiontimes) with no primary research, no sample, and commercial incentive to declare
   trends.
2. **The sources contradict each other on the core claim** — some assert extremely baggy
   revival, another asserts a move to a *"slightly more tailored, though still relaxed"*
   fit, i.e. the opposite direction.
3. The spec asked for TikTok/IG/YouTube social listening. **None was available.** No
   platform data, no engagement metrics, no share-of-voice.
*Disposition:* **F-09.1 does not survive as a basis for investment.** It is retained as a
**watch item only.** Any silhouette decision must wait for real social listening plus
internal sell-through by fit. **Domain 09 should be regarded as effectively unserved.**
*This matters:* silhouette direction is normally a first-order apparel decision. We cannot
make it from this evidence base.

---

# §4. ORCHESTRATOR A — Opportunity spaces

Convergence rule: an opportunity space requires **3+ independent domains pointing the same
direction.** Sizing is deliberately expressed as direction and rank, not dollars, because
F-04.1 cannot support dollar arithmetic.

### OS-1 · Women's basketball performance apparel, built on a women's block
**Converging domains: 13, 14, 02/07, 10 (inverted), 15 — five.**
Demand is proven at scale (F-13.1, F-13.2), structural capacity is expanding on a known
2026 schedule (F-13.3), our largest healthy US account has independently named it a
strength (F-13.4), female teens are the fastest-growing apparel spenders in our strongest
demographic (F-14.1), a concrete unmet product deficiency is technically documented
(F-13.5), and the company is already organised to execute it (F-15.1).

The sharpest insight sits in the *tension* between F-10.3 and F-13.1: **female sport
participation is falling while female basketball merchandise demand is exploding.** The
demand is therefore fan-led and culture-led more than participation-led. That argues
against a pure on-court performance line and for a **fan-to-court continuum** — product
that reads authentic on court but is bought and worn overwhelmingly off it.
**Confidence: HIGH.** Strongest space in the package by a wide margin.

### OS-2 · Wholesale-led basketball apparel re-engagement
**Converging domains: 07, 02, 03 — three.**
Wholesale grew $1.6bn while DTC fell $1.1bn (F-07.1). Dick's is healthy and growing;
Foot Locker's weakness is explicitly **footwear-retro-shaped**, not apparel-shaped
(F-07.2). Basketball apparel is structurally a wholesale category.
**Confidence: MED-HIGH.** This is a channel/route-to-market conclusion, not a product one,
and it should govern how OS-1 ships.

### OS-3 · Greater China basketball, locally designed
**Converging domains: 11, 03, 15 — three.**
Our China business is at an eight-year low (F-11.1) against a structural competitive shift
(F-11.2). Simultaneously the *local basketball leader* is soft — Li-Ning basketball retail
−19% (F-03.2).
**Confidence: LOW-MED, and deliberately ranked below its apparent size.** The reason is
F-03.2's unresolved ambiguity: if Li-Ning's basketball decline is category contraction,
this is a shrinking pool, not an opening. **Public data cannot distinguish these, and they
imply opposite investments.** See J2 and R-4.

### OS-4 · Teen retention through the on-court/everyday continuum
**Converging domains: 14, 10, 09(weak) — two-and-a-half.**
Clothing is the top teen wallet priority and we lead it (F-14.1), but teen inactivity is
rising (F-10.2) and challengers are taking share (F-14.2).
**Confidence: LOW-MED. Does not meet the 3-domain bar** on evidence of the quality required
— its third leg (Domain 09) did not survive skepticism. **Logged as a space, not
recommended for investment on this evidence.**

### OS-5 · Silhouette/fit repositioning — **NOT AN OPPORTUNITY SPACE**
Listed explicitly so its absence is legible. The culture evidence collapsed (F-09.1) and
the sources contradict each other on direction. **Recommending a silhouette move here
would be guessing.**

---

# §5. ORCHESTRATOR B — Product concepts

## ★ CONCEPT 1 — Women's on-court system, women's-block engineered
*(the #1 recommendation; traces to OS-1)*

| Attribute | Definition |
|---|---|
| **Consumer** | Female basketball fan-participants, 14-28, US-led. Fan-first, court-capable — per the F-10.3 / F-13.1 tension. |
| **Silhouette** | Full kit system: jersey, short, warm-up layer, base layer — engineered on a **women's pattern block**, not a graded-down men's block. Directly targets F-13.5: shoulder 14-15" spec, torso shortened 1-2", waist-to-hip shaping, short length re-proportioned so the waistband does not oversize. |
| **Feature set** | Fit geometry is the innovation and the story. Deliberately *not* a new-material claim — we have no NSRL data to support one. |
| **Price** | Two tiers. Accessible core **$40-55**; authentic/pro-grade **$75-90**, anchored against the observed $79.99 authentic short (F-06.1). **Tiers are shelf-price-anchored only — no margin validation was possible.** |
| **Positioning** | *"Built on her block."* The category has dressed women in men's patterns for forty years. This is the correction — and it is defensible, ownable, and hard to copy quickly because it is a pattern-library and grading investment, not a colourway. |
| **Region** | US first (evidence is US-centric: SFIA, Piper, WNBA, Dick's). Canada attaches free via Toronto Tempo (F-13.3). |
| **Season** | Land against the WNBA season and NCAA women's tournament; the 2026 two-franchise expansion is a fixed, dated demand event. |
| **Channel** | **Wholesale-led, Dick's-anchored** (F-07.1, F-07.2, F-13.4) — not DTC-led, against recent instinct. |

**Why this ranks #1:** it is the only concept scoring high on all three ranking factors
simultaneously. Consumer pull is proven at top-2-in-all-of-basketball scale (F-13.2).
Commercial upside attaches to a growing account that has already named the category
(F-13.4). Confidence is the highest in the package (five converging domains, HIGH-rated
sources, survived skepticism). And the *specific* product deficiency is documented
technically rather than inferred (F-13.5) — meaning we know what to build, not merely
where to play.

**Honest caveat:** F-15.1 indicates the organisation is already moving on women's
basketball. The genuinely differentiated element here is the **women's-block fit system**,
not the decision to enter. **Position the fit system as the proposal.**

## CONCEPT 2 — Expansion-market team apparel programme
*(traces to OS-1 + OS-2)*
Portland Fire and Toronto Tempo are new 2026 franchises with zero installed merchandise
base and, in Toronto, an entire country of first-time league consumers (F-13.3). Trade
reporting notes supply chain struggling to match women's-basketball demand with
speed-to-market as the constraint. **Concept: a fast-turn, wholesale-led expansion-team
programme prioritising speed over range.**
**Confidence: MED.** Depends on licensing rights and lead times not visible in public data.

## CONCEPT 3 — China-specific basketball apparel line
*(traces to OS-3)*
Locally designed, local price architecture, aligned to the already-announced China design
shift (F-11.2). **Confidence: LOW-MED. Recommend a scoped read, not investment**, until
J2/R-4 is resolved with internal data.

---

# §6. ORCHESTRATOR C — Risk, dependency, and what would make us wrong

| ID | Risk | Severity | What would make us wrong |
|---|---|---|---|
| **R-1** | **Sizing is unvalidated.** F-04.1 is internally incoherent and barred from arithmetic; F-13.1's growth rates have an undisclosed base. | **CRITICAL** | The women's absolute base is small enough that even triple-digit growth doesn't clear investment hurdles. **Nothing in public data rules this out.** |
| **R-2** | **Single-athlete concentration.** The women's demand signal leans heavily on Caitlin Clark (F-13.2). | **HIGH** | Injury, transfer or fading news cycle. Test whether demand holds across the 15-team league excluding Clark-attributable volume. |
| **R-3** | **No margin data.** Zero cost, margin, or elasticity input. A women's-specific block means new patterns, new grading, new SKU count, and lower per-SKU volume. | **HIGH** | The fit system may be structurally margin-dilutive at achievable volumes. **Unknowable from public data.** |
| **R-4** | **China direction is genuinely ambiguous** (F-03.2). | **HIGH** | If the China basketball category is contracting rather than Li-Ning ceding share, OS-3 invests into a shrinking pool. |
| **R-5** | **Cannibalisation is entirely unassessed.** No catalog data (Domain 05 cut), so overlap with existing women's training and sportswear lines is unknown. | **HIGH** | Concept 1 may substitute existing volume rather than add it. |
| **R-6** | **Capacity and speed.** The stated women's-basketball constraint is speed-to-market. | **MED** | Lead times may not permit landing against the 2026 season events. No internal capacity data. |
| **R-7** | **Silhouette direction unknown** (F-09.1 collapsed). | **MED** | We may engineer excellent fit into a silhouette the consumer is moving away from. |
| **R-8** | **Teen inactivity** (F-10.2) may signal a shrinking future participation base. | **MED** | Single-year data point; confirm next SFIA wave. |
| **R-9** | **US-centricity.** Nearly all surviving evidence is US. EMEA/APLA was cut entirely. | **MED** | Any global rollout assumption is unfounded here. |
| **R-10** | **The competitor-visible problem.** Every source used is public. adidas can read all of it. | **MED** | Timing advantage may be near-zero; F-03.3 shows adidas is already investing behind basketball. |

---

# §7. CHIEF ORCHESTRATOR — Recommendation

**Ranking: consumer pull × commercial upside × confidence.**

| Rank | Concept | Pull | Upside | Conf. | Verdict |
|---|---|---|---|---|---|
| **1** | **Women's on-court system, women's block** | HIGH | MED-HIGH* | **HIGH** | **Advance to internal validation** |
| 2 | Expansion-market team programme | MED-HIGH | MED* | MED | Scope — time-boxed, dated opportunity |
| 3 | China local basketball line | MED | UNKNOWN | LOW-MED | Hold pending R-4 resolution |
| — | Teen continuum (OS-4) | MED | UNKNOWN | LOW | Insufficient evidence |
| — | Silhouette repositioning | — | — | — | **Rejected — evidence collapsed** |

\* *Upside ratings are directional judgments from public demand signals. **No commercial
upside figure in this package is validated, because no margin, cost, or POS data existed.***

### The recommendation

**Advance Concept 1 to internal validation — do not fund it on this package.**

The women's basketball opportunity is the most strongly evidenced conclusion available from
public data: five converging domains, primary-source and large-n instruments, and it
survived adversarial review with its core intact. The differentiated move within it is the
**women's-block fit system**, because F-13.5 documents a specific, technical, physical
product deficiency — and because the organisation, per F-15.1, has already decided to be in
women's basketball, so entry is not the contribution.

But the honest position is this: **the three things that would let anyone approve spend —
absolute category size, margin structure, and cannibalisation — are precisely the three
things the missing corpus contained.** A recommendation to invest cannot be responsibly
made here.

### The four queries that convert this into a decision

Ranked by how much each would move the recommendation:

1. **Absolute women's basketball apparel revenue and unit base, 3-year trend, from POS** —
   resolves R-1, the binding constraint on everything.
2. **Margin and SKU-economics model for a women's-specific block** vs. graded-down men's,
   at realistic volumes — resolves R-3, which could invalidate Concept 1 outright.
3. **Current VOC on women's basketball apparel fit** — reviews, returns-reason coding, NSRL
   fit studies. Refreshes the nine-year-stale player evidence in F-13.5 and confirms the
   deficiency still exists.
4. **Overlap analysis vs. existing women's training/sportswear** — resolves R-5.

Queries 1 and 2 are gating. If either comes back adverse, Concept 1 does not proceed.
