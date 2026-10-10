// Method: how Home Court was researched and checked, what every label and
// number means, what has been corrected, and what is still unknown. The agent
// architecture lives here rather than on the front page.
import React, { useEffect } from "react";
import { markets, review, league, LEAGUE } from "../data.js";
import { LENS_AGENTS, SYNTHESIS_AGENTS } from "../agents/roster.js";
import { TIMING_KINDS, CERTAINTY, ROUTES, DEPENDENCIES, STATUSES, OWNERS, CLAIM_STATUS, EVIDENCE_TYPES, REFERENCE_KINDS } from "../agents/review-schema.js";
import { EVIDENCE_KIND, STRENGTH, SCORE_DEFS, SCORE_TIERS, MOOD_TIERS, fmtDate } from "../review.js";
import { Chip, SectionHead, href, SourceLink, EvidenceTag } from "../ui.jsx";
import { placeOf } from "../teams.js";

const cap = (x = "") => x.charAt(0).toUpperCase() + x.slice(1);
const SECTIONS = [["edition", "This edition"], ["research", "How it was researched"], ["evidence", "Evidence"], ["scores", "Scores"], ["timing", "Dates and planning"], ["status", "Status and owners"], ["checks", "What was checked"], ["corrections", "Corrections"], ["gaps", "Known gaps"]];

export default function Method({ anchor }) {
  useEffect(() => { if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView(), 50); }, [anchor]);
  const t = review.totals || {};
  const pub = markets.filter((m) => m.status === "complete");
  const queued = pub.reduce((s, m) => s + (m.verification ? m.verification.queue : 0), 0);
  const reading = pub.reduce((s, m) => s + (m.readingList || 0), 0);

  return (
    <div>
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>How Home Court works</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>Method</h1>
      <p className="hc-lede" style={{ marginTop: 18 }}>How the research was done, what was checked, what every label and number means, and what we still don't know.</p>
      <nav className="hc-row" aria-label="On this page" style={{ marginTop: 20 }}>
        {SECTIONS.map(([id, label]) => <a key={id} className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("method", id)}>{label}</a>)}
      </nav>

      <section className="hc-section" id="edition">
        <SectionHead eyebrow="The version everyone sees" title="This edition" />
        <div className="hc-grid hc-grid-2">
          <div className="hc-card hc-stack">
            <h3 className="hc-h3">The shared reviewed build</h3>
            <p>Everything on this site comes from research files kept in the project's repository. Corrections are made in those files and the site is rebuilt from them, so a fix reaches every page that uses the fact and every teammate sees the same version.</p>
            <p className="hc-small hc-muted">Covers the {LEAGUE.name} only, season {LEAGUE.season}. Last automated review: {fmtDate(pub.map((m) => m.updated).sort().pop())}.</p>
          </div>
          <div className="hc-card-invert hc-stack">
            <h3 className="hc-h3">Experimental runs stay in your browser</h3>
            <p>The Agents page can run the research agents live. Those runs are saved only in the browser that ran them. They aren't reviewed, teammates can't see them, and a market page labels them clearly when you switch to one.</p>
            <a className="hc-btn" style={{ display: "inline-block", textDecoration: "none" }} href={href("agents")}>The agents and the live console</a>
          </div>
        </div>
      </section>

      <section className="hc-section" id="research">
        <SectionHead eyebrow={`${LENS_AGENTS.length + SYNTHESIS_AGENTS.length} agents per market, then a league stage and a review pass`} title="How it was researched" />
        <div className="hc-grid hc-grid-2">
          <div className="hc-card hc-stack">
            <h3 className="hc-h3">Market research</h3>
            <p className="hc-small">Eleven lens agents wrote a dossier each: {LENS_AGENTS.map((a) => a.name).join(", ")}. A strategist turned them into the brief. A fact-check agent and an authenticity critic reviewed it, and an editor revised it.</p>
            <p className="hc-small">Live web search wasn't available for most of that work. So all but three dossiers (Portland's music, art and food) were written from the agents' own knowledge, current to about mid-2026. The site calls that <b>desk research</b> and treats its facts as unverified.</p>
            <p className="hc-small">The fact-check agents also worked mostly from model knowledge, with a few live spot-checks. Their verdicts are shown for transparency but don't count as verification. In New York, one introduced an error that is now corrected.</p>
          </div>
          <div className="hc-card hc-stack">
            <h3 className="hc-h3">League stage and review</h3>
            <ul className="hc-bullets hc-small">
              <li><b>League Pulse, {fmtDate(review.pulse?.asOf)}:</b> each team's 2026-27 roster, coach, results, City Edition status and big games, checked with live search and sourced.</li>
              <li><b>League calendar, {fmtDate(review.leagueCalendar?.verifiedAt)}:</b> {review.leagueCalendar?.confirmed} of {review.leagueCalendar?.events} league dates confirmed by a live source.</li>
              <li><b>League read, Oct 9, 2026:</b> a strategist compared the 30 briefs, found patterns and set the league-wide scores.</li>
              <li><b>House-style edit, Oct 10, 2026:</b> every file rewritten for clarity, with a script guarding that no name, number or date was lost.</li>
              <li><b>Review pass, Oct 10, 2026:</b> live checks on the riskiest claims in each market (at most 4 searches a market, 18 for Portland, New York and Detroit), editor follow-ups where checks conflicted, corrections at the source, and timing and hand-off fields added to every calendar entry and opportunity from the brief's own text.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="hc-section" id="evidence">
        <SectionHead eyebrow="Four kinds, labelled everywhere" title="Evidence" />
        <div className="hc-grid hc-grid-2">
          <div className="hc-card">
            <dl className="hc-def">
              {Object.entries(EVIDENCE_KIND).map(([k, v]) => <React.Fragment key={k}><dt><EvidenceTag kind={k} /></dt><dd>{v.detail}</dd></React.Fragment>)}
            </dl>
          </div>
          <div className="hc-card">
            <h3 className="hc-h3" style={{ marginBottom: 10 }}>Evidence strength</h3>
            <dl className="hc-def">
              {Object.entries(STRENGTH).map(([k, v]) => <React.Fragment key={k}><dt>{v.label}</dt><dd>{v.detail}</dd></React.Fragment>)}
            </dl>
            <p className="hc-small hc-muted">Strength counts only the verified claims an insight or idea rests on. Observed fan evidence is shown beside it but doesn't raise it, because an observation can cut either way; conflicting evidence is flagged. Strength never counts how many agents agreed or how confident an agent said it was. It is kept apart from upside, which is the brief's estimate of how big an idea could be.</p>
          </div>
        </div>
        <div className="hc-grid hc-grid-2" style={{ marginTop: "var(--grid-gap)" }}>
          <div className="hc-card">
            <h3 className="hc-h3" style={{ marginBottom: 10 }}>Live checks</h3>
            <dl className="hc-def">{Object.entries(CLAIM_STATUS).map(([k, v]) => <React.Fragment key={k}><dt>{v.split(":")[0]}</dt><dd>{cap(v.split(": ")[1])}</dd></React.Fragment>)}</dl>
            <p className="hc-small hc-muted">The research environment can't open web pages directly, so each check records what the search returned, with the title, publisher, publication date where shown, and the link for a reviewer to open.</p>
          </div>
          <div className="hc-card">
            <h3 className="hc-h3" style={{ marginBottom: 10 }}>Fan evidence and visual references</h3>
            <p className="hc-small">Observed evidence is logged by type: {Object.values(EVIDENCE_TYPES).join(", ").toLowerCase()}. Each records its source, whose view it reflects, when, and its limits. Social comments are directional only. No quotes, sales figures or segment sizes are invented; segment sizes from the desk research were never measured and are not shown.</p>
            <p className="hc-small" style={{ marginTop: 8 }}>Visual references ({Object.values(REFERENCE_KINDS).join(", ").toLowerCase()}) are links to things that exist, credited to their owners. They're kept apart from proposed concepts such as the collection ideas and the City Edition palette studies.</p>
          </div>
        </div>
      </section>

      <section className="hc-section" id="scores">
        <SectionHead eyebrow="Editorial estimates, shown as tiers" title="Scores" />
        <div className="hc-card" style={{ overflowX: "auto" }}>
          <table className="hc-deftable">
            <thead><tr><th>Measure</th><th>What it represents</th><th>Inputs</th><th>Type</th><th>Baseline</th><th>Updated</th></tr></thead>
            <tbody>
              {Object.entries(SCORE_DEFS).map(([k, v]) => <tr key={k}><th scope="row">{v.label}</th><td>{v.what}</td><td>{v.inputs}</td><td>{v.kind}</td><td>{v.baseline}</td><td>{v.updated}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="hc-grid hc-grid-2" style={{ marginTop: "var(--grid-gap)" }}>
          <div className="hc-card">
            <h3 className="hc-h3" style={{ marginBottom: 10 }}>Score tiers</h3>
            <p className="hc-small" style={{ marginBottom: 10 }}>The four market scores sit on a 0-100 scale where 50 is an average market among the 30. Nothing measured went into them, so the site shows tiers, not the numbers:</p>
            <ul className="hc-bullets hc-small">{SCORE_TIERS.map((x, i) => <li key={x.label}><b>{x.label}</b>: {i === 0 ? `${x.min} and up` : `${x.min} to ${SCORE_TIERS[i - 1].min - 1}`}</li>)}</ul>
          </div>
          <div className="hc-card">
            <h3 className="hc-h3" style={{ marginBottom: 10 }}>Fan mood and fan heat</h3>
            <p className="hc-small">Fan mood is the strategist's read of how warm a fan base felt going into the season: {MOOD_TIERS.map((x) => x.label.toLowerCase()).join(", ")}. It is local, not ranked across markets.</p>
            <p className="hc-small" style={{ marginTop: 8 }}>Fan heat by month is scaled to each city's own busiest month, which is 100. It shows when a city peaks, not how big it is. A 90 in Detroit and a 90 in Miami are not the same crowd, so the calendar's "closest to own peak" sort and the Compare page's mini charts compare shape only.</p>
          </div>
        </div>
      </section>

      <section className="hc-section" id="timing">
        <SectionHead eyebrow="Real years, honest certainty" title="Dates and planning" />
        <div className="hc-grid hc-grid-2">
          <div className="hc-card">
            <h3 className="hc-h3" style={{ marginBottom: 10 }}>What a date is</h3>
            <dl className="hc-def">{Object.entries(TIMING_KINDS).map(([k, v]) => <React.Fragment key={k}><dt>{v.split(":")[0]}</dt><dd>{cap(v.split(": ")[1])}</dd></React.Fragment>)}</dl>
            <h3 className="hc-h3" style={{ margin: "14px 0 10px" }}>How sure we are</h3>
            <dl className="hc-def">{Object.entries(CERTAINTY).map(([k, v]) => <React.Fragment key={k}><dt>{v.split(":")[0]}</dt><dd>{cap(v.split(": ")[1])}</dd></React.Fragment>)}</dl>
            <p className="hc-small hc-muted">Every entry carries a real year. A planning season runs October to September, so October 2027 belongs to 2027-28 and never shows up as this month's news in 2026. "Act by" appears only when a brief says when work must start. No lead times are assumed.</p>
          </div>
          <div className="hc-card">
            <h3 className="hc-h3" style={{ marginBottom: 10 }}>How it would get made</h3>
            <dl className="hc-def">{Object.entries(ROUTES).map(([k, v]) => <React.Fragment key={k}><dt>{v.split(":")[0]}</dt><dd>{cap(v.split(": ")[1])}</dd></React.Fragment>)}</dl>
            <h3 className="hc-h3" style={{ margin: "14px 0 10px" }}>Dependencies, none assumed</h3>
            <p className="hc-small">{Object.values(DEPENDENCIES).join(" · ")}</p>
            <p className="hc-small hc-muted" style={{ marginTop: 8 }}>The site never assumes stock, rights, capacity, partner agreement or a place on Nike's calendar. Each is listed as something to confirm.</p>
          </div>
        </div>
      </section>

      <section className="hc-section" id="status">
        <SectionHead eyebrow="Nothing is approved" title="Status and owners" />
        <div className="hc-grid hc-grid-2">
          <div className="hc-card">
            <dl className="hc-def">{Object.entries(STATUSES).map(([k, v]) => <React.Fragment key={k}><dt>{v.split(":")[0]}</dt><dd>{cap(v.split(": ")[1])}</dd></React.Fragment>)}</dl>
            <p className="hc-small hc-muted">Every opportunity is a hypothesis today. Only a named person can move one on, and no one has yet. Partners named in the briefs are prospects: none has been contacted or agreed to anything.</p>
          </div>
          <div className="hc-card">
            <p className="hc-small">Each opportunity proposes the function that would most naturally lead it: {OWNERS.join(", ")}. These are suggestions, not assignments.</p>
            <p className="hc-small" style={{ marginTop: 8 }}>Each market also has an owner, a reviewer and a sign-off field in <code>research/nba/review-status.json</code>. All are empty: no person has signed off any market. The site shows them as "unassigned" and "none yet" until someone fills them in.</p>
          </div>
        </div>
      </section>

      <section className="hc-section" id="checks">
        <SectionHead eyebrow="Counts used on the front page" title="What was checked" />
        <div className="hc-card">
          <dl className="hc-def">
            <dt>{(t.claims || 0).toLocaleString()} claims checked live</dt><dd>Claims a market agent looked up with live search on Oct 10, 2026: {t.verified || 0} verified, {t.contradicted || 0} corrected, {t.unclear || 0} unsettled, across {t.markets || 0} markets and {t.searches || 0} searches. They were picked for risk: launch doors, history behind top insights, near-term dates and key partners.</dd>
            <dt>{review.corrections.length} corrections</dt><dd>Errors fixed in the research files, listed below.</dd>
            <dt>{queued.toLocaleString()} claims still unverified</dt><dd>Dated or checkable claims the research agents flagged for a live check, de-duplicated. Most of the desk research beyond these is unchecked too.</dd>
            <dt>{(t.checkedSources || 0).toLocaleString()} sources retrieved</dt><dd>Distinct pages returned by live searches that the checks, fan evidence and League Pulse relied on.</dd>
            <dt>{reading.toLocaleString()} reading-list links</dt><dd>Pages the research agents listed from memory as places to verify their work. Nobody opened them, so they are not counted as sources anywhere.</dd>
          </dl>
        </div>
        <div className="hc-card" style={{ marginTop: "var(--grid-gap)", overflowX: "auto" }}>
          <table className="hc-deftable">
            <thead><tr><th>Market</th><th>Checked live</th><th>Verified</th><th>Corrected</th><th>Unsettled</th><th>Fan evidence</th><th>Timing reviewed</th><th>Still unverified</th></tr></thead>
            <tbody>
              {pub.map((m) => <tr key={m.id}><th scope="row"><a href={href("m", m.id)}>{placeOf(m.team)} {m.team.name}</a></th><td>{m.evidence ? m.evidence.claims : 0}</td><td>{m.evidence ? m.evidence.verified : 0}</td><td>{m.evidence ? m.evidence.contradicted : 0}</td><td>{m.evidence ? m.evidence.unclear : 0}</td><td>{m.evidence ? m.evidence.observations + m.evidence.references : 0}</td><td>{m.planReviewed ? "Yes" : "No"}</td><td>{m.verification.queue}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hc-section" id="corrections">
        <SectionHead eyebrow="Fixed at the source" title="Corrections" />
        {review.corrections.length ? (
          <div className="hc-grid">
            {review.corrections.map((c, i) => (
              <article key={i} className="hc-card hc-stack">
                <div className="hc-row"><a href={href("m", c.market)} style={{ fontWeight: 700 }}>{c.market.toUpperCase()}</a><Chip tone="line">Found {fmtDate(c.found)}</Chip><Chip tone="line">{c.by === "editor" ? "Editor" : "Review pass"}</Chip></div>
                <p className="hc-small"><b>Was:</b> {c.was}</p>
                <p className="hc-small"><b>Now:</b> {c.now}</p>
                {c.why && <p className="hc-small hc-muted"><b>How it happened:</b> {c.why}</p>}
                <div className="hc-tiny hc-muted">Changed in {c.files.join(", ")}</div>
                {c.sources.length > 0 && <ul className="hc-bullets hc-tiny">{c.sources.map((x, k) => <li key={k}><SourceLink s={x} /></li>)}</ul>}
              </article>
            ))}
          </div>
        ) : <div className="hc-card hc-muted">No corrections logged.</div>}
      </section>

      <section className="hc-section" id="gaps">
        <SectionHead eyebrow="Read this before acting" title="Known gaps" />
        <div className="hc-card">
          <ul className="hc-bullets">
            <li>Most of the desk research is unchecked. The live checks covered a few high-risk claims per market, not whole dossiers. This site is not validated as a whole.</li>
            <li>No sales, sell-through, attendance, survey or social-listening data went into any score or insight.</li>
            <li>Fan segments are sketches from desk research. Women, younger fans, families and style-led buyers are thinly covered in most markets.</li>
            <li>Observed fan evidence and visual references were gathered for Portland, New York and Detroit only.</li>
            <li>Store lists are largely unverified. Confirm a door is open, and will carry the product, before planning a launch there.</li>
            <li>Timing and hand-off fields come from the briefs' own text. Lead times, stock, rights, capacity and calendar slots are not known and not assumed.</li>
            <li>No market has an owner, a reviewer or a human sign-off yet.</li>
            <li>This edition covers the {LEAGUE.name} only. The data carries a league id so a WNBA edition can sit alongside it, but the WNBA needs its own research, fan segments and calendars, not a copy of these.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
