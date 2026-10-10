# Home Court house style

Home Court should read like a good city guide or a magazine's city issue. The writer knows the place and is writing for smart people in a hurry. The readers are Nike Basketball designers and merchants in Portland. They want three things from every page: what's true about this city, why it matters, and what to make.

## Voice

- **Plain, confident, specific.** Write the way a sharp editor talks, not the way a strategy deck reads.
- **Short sentences.** Aim for an average under 20 words. Split anything over 30.
- **One idea per sentence.** Lead with the point.
- **Concrete nouns and verbs:** the bar, the block, the dish, the date, the jersey. Not "touchpoints", "storytelling moments" or "ecosystems".
- **Active voice, present tense** for how things are.
- **Imperative for advice** ("Sign the partners before the first drop."). Plain statements for observations ("Second lines run from Labor Day to June.").
- **Name names.** Real places, people, dates, dishes and local words are the point of the guide.
- **Honest confidence.** If the original says something is reported, unconfirmed or still to check, keep that in plain words ("reportedly", "if it's confirmed", "still unconfirmed"). Never turn a hedge into a fact, and don't add hedges that weren't there.
- **Some warmth and wit, no hype.** No exclamation marks except in quoted names or chants (for example "Rip City!").

## Cut on sight

- **Consultant-speak:** leverage, unlock, activate against, activation moment, touchpoint, ecosystem, landscape, synergy, holistic, robust, best-in-class, value proposition, drive engagement, move the needle, lean into, double down, at the intersection of, key (as an adjective), crucial, pivotal, critical.
- **Brochure filler:** vibrant, bustling, nestled, rich history, hidden gem, tapestry, melting pot, world-class, must-visit, eclectic, iconic (unless the thing really is iconic and you can't say it better).
- **AI tells:**
  - "not just X, but Y"; "it's not X, it's Y"; "more than just"
  - "truly", "deeply", "genuinely", "authentic(ally)"
  - "a testament to", "serves as", "plays a role", "speaks to", "resonates"
  - lists of three for rhythm's sake, and closing a paragraph on a moral
- **Stacked clauses:** semicolons chaining several thoughts, or long sentences held together by "while", "which", "so" and brackets. Break them up.
- **Brackets:** at most one short aside per sentence. If it matters, give it its own sentence.
- **Em dashes:** at most one per field. Commas, colons and full stops do the job.
- **"Nike should…"** at the start of every implication. Use the imperative, and name Nike only where it's needed for clarity.
- **Shorthand the reader wouldn't say out loud:** "SKU" becomes "pieces" or "styles". "Team-marks-only product" becomes "logo-only product". "Activation" usually becomes "launch", "event", "drop" or "night".

## Field by field

| Field | How to write it |
|---|---|
| Dossier `headline` | A magazine headline of 90 characters at most. Make one point, not a summary of the whole file. |
| `summary` | A dek: 2-4 sentences on what's going on and why it matters to the team. |
| Brief `headline` | 120 characters at most: the market's story in a line. |
| Brief `thesis` | A short opening paragraph, 4-7 sentences, no semicolon chains. End on what to do, in order. |
| `title` (insights, opportunities) | 2-8 words, specific. Use a colon only when it earns its place. |
| `detail`, `insight`, `implication`, `summary` (opportunity) | 1-3 short sentences each. |
| `why`, `role`, `meaning`, `profile`, `note` | One sentence, ideally under 25 words. |
| `how`, `play`, `when` | Steps as short sentences, in order. Keep every date and partner. |
| Products, `productHooks` | Lead with the product, then the twist: "Satin warm-up with brass-foil trim, co-designed with one Social Aid & Pleasure Club." |
| `watchouts`, risks | State the risk, then the rule. |
| `provenance.verify` | Short checklist items ("Confirm whether…"). Keep every item and what it asks. |
| Fact-check `claim` and `note`; critique `problem`, `fix` and `strengths` | Clear review notes, not magazine copy. Say what was wrong and what changed in one or two sentences. |

## Rules that never bend

1. **Keep every fact.** Every name, number, date, place, hex code, price and statistic stays. Cutting words is fine; cutting facts isn't. A fact repeated in the same file may be kept just once.
2. **Keep numbers as numerals** ("3 or 4 pieces", "June 5", "the '77 title").
3. **Keep the JSON shape:** the same keys, the same number of items in every list, the same order.
4. **Don't touch data fields:**
   - ids, `team`, `lens` and `target`
   - `hex`, `month` and `months`, `intensity`, `heat`, scores, `priority` and `size`
   - enum values such as `type`, `role` (for districts), `impact`, `reception`, `verdict`, `severity` and `confidence`
   - `evidence`, `sources` and every URL
   - `provenance.mode` and `provenance.asOf`
   - every `name`, `term`, `season`, `era` and `date`
5. **Add nothing new:** no new facts, places, people or claims.
6. **Own words:** never quote lyrics, poems or slogans beyond a few words.

`node scripts/nba/fact-guard.mjs <team> <file> [--base <git ref>]` enforces rules 1-4 against an earlier version of the file (by default, the text before the October 2026 rewrite). `node scripts/nba/voice-lint.mjs <team> <file>` flags the "cut on sight" list, long sentences and long headlines.

## Before and after

**Dossier headline** (New Orleans, music)
- *Before:* In New Orleans music runs on a street calendar rather than a playlist: Sunday second lines, Carnival marching bands and bounce's ward call-outs keep the same October-to-June clock as the Pelicans, so Nike should co-sign the clubs, bands and artists who own that sound instead of sampling it.
- *After:* New Orleans music runs on a street calendar, and it keeps the Pelicans' hours.
- The second lines, Carnival bands and bounce live on in the summary and insights.

**Brief thesis** (Portland)
- *Before:* Portland is a loyalty-first, one-team region whose crowd includes a large share of the people who design sportswear for a living, so it rewards craft and punishes anything that feels like a corporate template. In 2026-27 it has no new City Edition (the 2019-20 design is being re-worn), no Specter kit and no opening-night or Christmas game, yet June 5, 2027 is the 50th anniversary of the only title…
- *After:* Portland is a one-team town, and a lot of the people in its stands design sportswear for a living. They reward craft and can spot a template from the upper deck. This season the Blazers have no new City Edition (they're re-wearing 2019-20), no Specter kit and no opening-night or Christmas game. But June 5, 2027 is the 50th anniversary of the city's only title…

**Opportunity `how`**
- *Before:* Open NBA, team, alumni and estate talks (Walton, Lucas, Ramsay, Schonely) this month, with Albina co-authors signed before the first drop; print displacement context on hangtags and in launch content.
- *After:* Open rights talks this month with the NBA, the team, alumni and estates (Walton, Lucas, Ramsay, Schonely). Sign the Albina co-authors before the first drop. Put the displacement story on hangtags and in launch content.

**Insight `implication`**
- *Before:* Commission one club per season to co-design a colorway, pay the club and its band, and underwrite the club's parade police and permit fees rather than staging a branded 'second line' for content.
- *After:* Each season, pay one club to co-design a colorway. Pay its band too, and cover the club's police and permit fees. Don't stage a branded "second line" for content.

**Rhythm `fanBehavior`**
- *Before:* Fans mostly watch from home on dark, wet weeknights, weeknight crowds thin for non-marquee opponents, and talk turns to standings and trade rumors.
- *After:* Dark, wet weeknights keep fans on the couch. Crowds thin out for lesser opponents, and talk turns to standings and trade rumors.

**Fact-check `note`**
- *Before:* Live spot-check: it is the 'NOLA Nights' edition, vivid purple with neon green, skeletal 'Skelican' logos and a NOLA wordmark, inspired by the city at night; not Carnival gold. Hoops, art, culture, fanbase and uniform dossiers rewritten accordingly.
- *After:* Checked live: it's the "NOLA Nights" edition (purple and neon green, skeletal "Skelican" logos, a NOLA wordmark), inspired by the city at night, not Carnival gold. Fixed in the hoops, art, culture, fanbase and uniform dossiers.
