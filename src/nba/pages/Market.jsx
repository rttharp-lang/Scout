// One market. It opens on an executive brief (what sets the fan base apart,
// the three best-supported insights, three product hypotheses, what's coming
// and what's due, and the evidence status), then the full picture behind
// disclosures: opportunities, the fan year, product, fans, city, shopping,
// partners and the evidence log.
import React, { useEffect, useMemo, useState } from "react";
import { loadMarket, loadLiveRun, clearLiveRun, inkOn, heroColor, MONTHS, review as siteReview, today } from "../data.js";
import { TEAM_BY_ID, placeOf } from "../teams.js";
import { AGENT_BY_ID, LENS_AGENTS } from "../agents/roster.js";
import { DEPENDENCIES, EVIDENCE_TYPES, REFERENCE_KINDS, CLAIM_STATUS } from "../agents/review-schema.js";
import { Chip, Scorecard, PaletteRow, Priority, Provenance, SectionHead, KV, href, EvidenceTag, Strength, Certainty, When, ActBy, Route, Status, SourceLink, Mood } from "../ui.jsx";
import { verificationOf } from "../agents/provenance.js";
import { RhythmChart } from "../charts.jsx";
import { LensView, Jersey, Opportunity } from "./parts.jsx";
import { inferTiming, seasonOf, endedBefore, ymOf, fmtDate, STRENGTH_RANK, SCORE_DEFS, ymLabel, nextYM } from "../review.js";

const SECTIONS = [
  ["brief", "Brief"], ["opportunities", "Opportunities"], ["calendar", "Calendar"], ["product", "Product"],
  ["fandom", "Fans"], ["culture", "City"], ["retail", "Shopping"], ["partners", "Partners"], ["review", "Evidence"],
];
const CULTURE_LENSES = ["music", "art", "food", "culture", "underground", "hoops"];

export default function Market({ id }) {
  const team = TEAM_BY_ID[id];
  const [published, setPublished] = useState(undefined);
  const [live, setLive] = useState(() => loadLiveRun(id));
  const [useLive, setUseLive] = useState(false);
  const [active, setActive] = useState("brief");

  useEffect(() => {
    let alive = true;
    setPublished(undefined);
    setLive(loadLiveRun(id));
    setUseLive(false);
    loadMarket(id).then((m) => { if (alive) setPublished(m); });
    window.scrollTo(0, 0);
    return () => { alive = false; };
  }, [id]);

  // Scrollspy for the sticky section nav.
  useEffect(() => {
    const els = SECTIONS.map(([s]) => document.getElementById(s)).filter(Boolean);
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-80px 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [published, useLive]);

  const liveComplete = live && live.strategy && live.dossiers && LENS_AGENTS.every((a) => live.dossiers[a.id]);
  const data = useLive && liveComplete ? asLive(live) : published;

  if (!team) return <div className="hc-empty">We can't find that market.</div>;
  if (published === undefined) return <div className="hc-empty">Loading {placeOf(team)}…</div>;
  if (!data) {
    return (
      <div className="hc-empty">
        <h1 className="hc-h1" style={{ color: "var(--text)" }}>{placeOf(team)} {team.name}</h1>
        <p style={{ marginTop: 12 }}>This market isn't in the guide yet.</p>
      </div>
    );
  }
  return <MarketView team={team} data={data} live={liveComplete ? live : null} useLive={useLive && liveComplete} setUseLive={setUseLive} active={active}
    onDiscardLive={() => { clearLiveRun(id); setLive(null); setUseLive(false); }} />;
}

// A browser-local run has no review layer: give its calendar inferred,
// unreviewed timing and no evidence, so nothing in it reads as checked.
function asLive(run) {
  const strategy = JSON.parse(JSON.stringify(run.strategy));
  const t = inferTiming(strategy.calendar);
  strategy.calendar.forEach((c, i) => { c.timing = t[i]; });
  strategy.topInsights.forEach((x) => { x.support = { verified: 0, corrected: 0, observed: 0, conflicting: 0, ids: [], strength: "unchecked" }; });
  strategy.opportunities.forEach((o) => { o.handoff = null; o.support = { verified: 0, corrected: 0, observed: 0, conflicting: 0, ids: [], strength: "unchecked" }; });
  return { ...run, strategy, evidence: null, stewardship: null, updated: run.ranAt ? run.ranAt.slice(0, 10) : null, isLive: true };
}

function MarketView({ team, data, live, useLive, setUseLive, active, onDiscardLive }) {
  const s = data.strategy;
  const d = data.dossiers;
  const now = today();
  const bg = heroColor(team);
  const ink = inkOn(bg);
  const [lens, setLens] = useState("music");
  const ver = useMemo(() => verificationOf(data), [data]);
  const ev = data.evidence;
  const corrections = useMemo(() => [
    ...siteReview.corrections.filter((c) => c.market === team.id && c.by === "editor"),
    ...(ev ? ev.corrections.map((c) => ({ was: c.claim, now: c.correction, files: c.files, sources: (ev.claims.find((x) => x.id === c.claimId) || {}).sources || [], found: ev.checkedOn })) : []),
  ], [team.id, ev]);

  const print = (mode) => {
    const opened = [];
    if (mode === "brief") document.body.classList.add("hc-printing-brief");
    else document.querySelectorAll("details:not([open])").forEach((el) => { el.open = true; opened.push(el); });
    const done = () => { document.body.classList.remove("hc-printing-brief"); opened.forEach((el) => { el.open = false; }); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  };
  const jump = (e, sid) => { e.preventDefault(); document.getElementById(sid)?.scrollIntoView({ behavior: "smooth" }); };

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────── */}
      <section className="hc-hero" style={{ "--team": bg, "--team-ink": ink }}>
        <div className="hc-hero-stripes" aria-hidden="true">{team.colors.map((c, i) => <span key={i} style={{ background: c, boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }} />)}</div>
        <div className="hc-hero-grid">
          <div>
            <div className="hc-row" style={{ marginBottom: 14 }}>
              <Chip>{team.abbr}</Chip>
              <Chip>{team.conference} · {team.division}</Chip>
              <Chip>{team.arena}</Chip>
            </div>
            <h1 className="hc-display hc-hero-city">{placeOf(team)}</h1>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, textTransform: "uppercase", fontSize: "clamp(1.6rem, 3.6vw, 2.8rem)", lineHeight: 1, marginTop: 6, opacity: 0.85 }}>{team.name}</div>
            <p style={{ marginTop: 22, fontSize: "clamp(1.1rem, 1.8vw, 1.5rem)", lineHeight: 1.3, fontWeight: 600, maxWidth: "34ch" }}>{s.headline}</p>
          </div>
          <div className="hc-hero-panel">
            <div className="hc-eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>Fan type · an interpretation</div>
            <div className="hc-h3" style={{ marginTop: 4 }}>{s.archetype.name}</div>
            <p className="hc-small" style={{ marginTop: 6, color: "rgba(255,255,255,0.82)" }}>{s.archetype.description}</p>
            <hr className="hc-divider" style={{ background: "rgba(255,255,255,0.18)" }} />
            <Scorecard scorecard={s.scorecard} />
          </div>
        </div>
      </section>

      {live && (
        <div className={`hc-banner hc-no-print${useLive ? " hc-live-warning" : ""}`} role="status">
          <span>{useLive
            ? <><b>You're looking at an experimental run saved in this browser only.</b> It hasn't been reviewed, teammates can't see it, and nothing in it has been checked.</>
            : <>This browser also holds an experimental run from {new Date(live.ranAt).toLocaleString()}. It isn't shared or reviewed.</>}</span>
          <span className="hc-row">
            <button className="hc-pill-btn" aria-pressed={!useLive} onClick={() => setUseLive(false)}>Reviewed version</button>
            <button className="hc-pill-btn" aria-pressed={useLive} onClick={() => setUseLive(true)}>Experimental run</button>
            <button className="hc-pill-btn" onClick={onDiscardLive}>Discard it</button>
          </span>
        </div>
      )}

      <div className="hc-statusbar" role="note">
        {data.isLive ? <b>Experimental run · not reviewed</b> : <b>Shared reviewed build</b>}
        <span>Last reviewed {data.updated ? fmtDate(data.updated) : "not yet"} (automated check)</span>
        <span>Owner: {data.stewardship?.owner || "unassigned"}</span>
        <span>Human sign-off: {data.stewardship?.signedOff || "none yet"}</span>
        <span>{ev ? `${ev.claims.length} claims checked live` : "No live checks"} · {ver.queue.length} still unverified</span>
        <a href={`#/m/${team.id}`} onClick={(e) => jump(e, "review")}>See the evidence</a>
      </div>

      <nav className="hc-subnav hc-no-print" aria-label="Sections">
        {SECTIONS.map(([sid, label]) => <a key={sid} href={`#/m/${team.id}`} className={active === sid ? "is-active" : ""} onClick={(e) => jump(e, sid)}>{label}</a>)}
        <a href={`#/m/${team.id}`} style={{ marginLeft: "auto" }} onClick={(e) => { e.preventDefault(); print("brief"); }}>Print brief</a>
        <a href={`#/m/${team.id}`} onClick={(e) => { e.preventDefault(); print("full"); }}>Print all</a>
      </nav>

      <ExecutiveBrief team={team} data={data} now={now} ver={ver} corrections={corrections} />

      {/* ── Opportunities ────────────────────────────── */}
      <section className="hc-section" id="opportunities">
        <SectionHead eyebrow="Product hypotheses, not approved plans" title="Opportunities" />
        <p className="hc-small hc-muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: "80ch" }}>Every idea here is a hypothesis until a named owner tests it. Upside is the brief's editorial estimate of size; evidence strength counts how many of the facts it rests on were verified live. They are separate on purpose.</p>
        <div className="hc-grid hc-grid-2">
          {[...s.opportunities].sort((a, b) => a.priority - b.priority).map((o) => <Opportunity key={o.id} o={o} insights={s.topInsights} />)}
        </div>
      </section>

      <FanYear s={s} d={d} now={now} />

      {/* ── Product ──────────────────────────────────── */}
      <section className="hc-section" id="product">
        <SectionHead eyebrow="Proposed concepts" title="Product" />
        <div className="hc-card-invert">
          <div className="hc-row" style={{ justifyContent: "space-between" }}><div className="hc-eyebrow">The collection idea</div><EvidenceTag kind="hypothesis" /></div>
          <h3 className="hc-display" style={{ fontSize: "clamp(2.2rem, 5vw, 3.8rem)", marginTop: 6 }}>{s.collection.name}</h3>
          <p className="hc-lede" style={{ color: "var(--text-muted-invert)", marginTop: 10 }}>{s.collection.story}</p>
        </div>
        <details className="hc-fold">
          <summary>The {s.collection.themes.length} collection themes, piece by piece</summary>
          <div className="hc-grid hc-grid-2">
            {s.collection.themes.map((t, i) => (
              <article key={i} className="hc-card hc-stack">
                <div className="hc-eyebrow">Theme {i + 1} · For {t.segment}</div>
                <h4 className="hc-h2">{t.name}</h4>
                <p>{t.story}</p>
                <PaletteRow palette={t.palette} />
                <KV label="Graphics">{t.graphics}</KV>
                <KV label="Materials & trims">{t.materials}</KV>
                <div>
                  <div className="hc-kv-label">The pieces</div>
                  <ul className="hc-list">
                    {t.pieces.map((p, k) => <li key={k}><div className="hc-row" style={{ justifyContent: "space-between" }}><b>{p.item}</b><span className="hc-row"><Chip tone="line">{p.category}</Chip><Chip tone={p.tier === "limited" ? "pop" : p.tier === "premium" ? "ink" : undefined}>{p.tier}</Chip></span></div><div className="hc-small hc-muted" style={{ marginTop: 4 }}>{p.detail}</div></li>)}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </details>

        <div className="hc-card" style={{ marginTop: "var(--grid-gap)" }}>
          <div className="hc-split" style={{ alignItems: "start" }}>
            <div className="hc-stack">
              <div className="hc-row" style={{ justifyContent: "space-between" }}><div className="hc-eyebrow">The City Edition idea · a future uniform concept</div><EvidenceTag kind="hypothesis" /></div>
              <h3 className="hc-display" style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)" }}>{s.uniform.concept}</h3>
              <p className="hc-lede" style={{ color: "var(--text)" }}>{s.uniform.narrative}</p>
              <p className="hc-small hc-muted">Uniforms run through the NBA and team uniform program and Nike's product calendar. Nothing here assumes a slot, rights or approval.</p>
              <PaletteRow palette={s.uniform.palette} />
              <details className="hc-more">
                <summary>Motifs, type, details and what to avoid</summary>
                <div className="hc-stack">
                  <KV label="Motifs"><div className="hc-row">{s.uniform.motifs.map((m, i) => <Chip key={i}>{m}</Chip>)}</div></KV>
                  <KV label="Typography">{s.uniform.typography}</KV>
                  <KV label="Details"><ul className="hc-bullets">{s.uniform.details.map((x, i) => <li key={i}>{x}</li>)}</ul></KV>
                  <KV label="Avoid"><ul className="hc-bullets">{s.uniform.avoid.map((x, i) => <li key={i}>{x}</li>)}</ul></KV>
                  <KV label="Other ideas"><ul className="hc-list">{s.uniform.alternates.map((a, i) => <li key={i}><b>{a.name}</b> — {a.idea}</li>)}</ul></KV>
                </div>
              </details>
            </div>
            <div>
              <Jersey palette={s.uniform.palette} team={team} />
              <p className="hc-tiny hc-muted" style={{ textAlign: "center", marginTop: 10 }}>Proposed concept: a palette study from the brief, not a uniform design.</p>
            </div>
          </div>
        </div>

        <References refs={ev ? ev.references.filter((r) => r.kind === "historic-uniform" || r.kind === "lettering-art-materials") : []} title="Observed references: uniforms, lettering, art and materials" insights={s.topInsights} />
        <details className="hc-fold">
          <summary>The uniform archive (desk research, unverified)</summary>
          <UniformArchive u={d.uniform} />
        </details>
      </section>

      {/* ── Fandom ───────────────────────────────────── */}
      <section className="hc-section" id="fandom">
        <SectionHead eyebrow="Who's in the stands" title="The fans" />
        <Fanbase f={d.fanbase} ev={ev} insights={s.topInsights} />
      </section>

      {/* ── Culture ──────────────────────────────────── */}
      <section className="hc-section" id="culture">
        <SectionHead eyebrow="Six scenes, desk research" title="The city" />
        <div className="hc-tabs" role="tablist">
          {CULTURE_LENSES.map((l) => <button key={l} role="tab" aria-selected={lens === l} aria-pressed={lens === l} className="hc-pill-btn" onClick={() => setLens(l)}>{AGENT_BY_ID[l].name}</button>)}
        </div>
        <LensView dossier={d[lens]} fold />
      </section>

      {/* ── Retail ───────────────────────────────────── */}
      <section className="hc-section" id="retail">
        <SectionHead eyebrow="Where, when and how they shop" title="Shopping">
          <a className="hc-btn hc-btn-ghost hc-no-print" style={{ textDecoration: "none" }} href={`/scout/?city=${encodeURIComponent(`${team.city}, ${team.state}`)}`}>Best retail in {team.city} on Scout ↗</a>
        </SectionHead>
        <p className="hc-small hc-muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: "80ch" }}>Stores come from desk research. Only those listed under Evidence were checked live. Confirm a door is open, and will carry the product, before planning a launch there.</p>
        <div className="hc-grid hc-grid-3">
          {[["Where to sell", s.retailPlaybook.where], ["When to sell", s.retailPlaybook.when], ["How to sell", s.retailPlaybook.how]].map(([t, items]) => (
            <div key={t} className="hc-card-invert"><h3 className="hc-h2">{t}</h3><ul className="hc-list" style={{ marginTop: 10 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          ))}
        </div>
        <References refs={ev ? ev.references.filter((r) => r.kind === "court-store-space") : []} title="Observed references: courts, stores and community spaces" insights={s.topInsights} />
        <details className="hc-fold">
          <summary>Districts, stores and shopping habits (desk research)</summary>
          <Retail land={d["retail-landscape"]} beh={d["retail-behavior"]} />
        </details>
      </section>

      {/* ── Partners & risks ─────────────────────────── */}
      <section className="hc-section" id="partners">
        <SectionHead eyebrow="Prospects, not agreements" title="Partners and risks" />
        <p className="hc-small hc-muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: "80ch" }}>No one on this list has been contacted or has agreed to anything. Check each organization exists and still runs the program named before any outreach.</p>
        <div className="hc-split">
          <div className="hc-grid hc-grid-2">
            {s.partners.map((p, i) => (
              <div key={i} className="hc-card hc-stack">
                <div className="hc-row"><Chip tone="warn">Prospect</Chip><Chip tone="line">{p.type}</Chip></div>
                <h3 className="hc-h3">{p.name}</h3>
                <p className="hc-small hc-muted">{p.why}</p>
                <p className="hc-implication">{p.idea}</p>
              </div>
            ))}
          </div>
          <div className="hc-card-invert">
            <h3 className="hc-h2">Watch out for</h3>
            <ul className="hc-list" style={{ marginTop: 10 }}>{s.risks.map((r, i) => <li key={i}><b>{r.risk}</b><div className="hc-small hc-muted" style={{ marginTop: 4 }}>{r.mitigation}</div></li>)}</ul>
            <hr className="hc-divider" style={{ background: "#2a2a2a" }} />
            <div className="hc-eyebrow">Why these scores (editorial estimates)</div>
            <p className="hc-small hc-muted" style={{ marginTop: 6 }}>{s.scorecard.rationale}</p>
          </div>
        </div>
      </section>

      {/* ── Evidence ─────────────────────────────────── */}
      <section className="hc-section" id="review">
        <SectionHead eyebrow="Behind the brief" title="Evidence" />
        <Review data={data} ver={ver} corrections={corrections} />
      </section>
    </div>
  );
}

// ── Executive brief ─────────────────────────────────────────────────
function ExecutiveBrief({ team, data, now, ver, corrections }) {
  const s = data.strategy;
  const ev = data.evidence;
  const insights = s.topInsights.map((t, i) => ({ ...t, i })).sort((a, b) => STRENGTH_RANK[a.support.strength] - STRENGTH_RANK[b.support.strength] || a.i - b.i).slice(0, 3);
  const ideas = [...s.opportunities].sort((a, b) => a.priority - b.priority || STRENGTH_RANK[a.support.strength] - STRENGTH_RANK[b.support.strength] || ({ high: 0, medium: 1, low: 2 }[a.size] - { high: 0, medium: 1, low: 2 }[b.size])).slice(0, 3);
  const upcoming = s.calendar.filter((c) => c.timing && c.timing.kind !== "action" && !endedBefore(c.timing, now.ym)).sort((a, b) => a.timing.start.localeCompare(b.timing.start) || a.priority - b.priority).slice(0, 4);
  const soon = nextYM(nextYM(now.ym));
  const due = [
    ...s.calendar.filter((c) => c.timing && ((c.timing.kind === "action" && !endedBefore(c.timing, now.ym) && ymOf(c.timing.start) <= soon) || (c.timing.actBy && ymOf(c.timing.actBy) <= soon && !endedBefore(c.timing, now.ym)))).map((c) => ({ key: `c${c.window}`, title: c.moment, when: c.timing.actBy || c.timing.start, note: c.timing.actNote || c.play })),
    ...s.opportunities.filter((o) => o.handoff && ymOf(o.handoff.actBy) <= soon).map((o) => ({ key: `o${o.id}`, title: o.title, when: o.handoff.actBy, note: o.handoff.actNote })),
  ].sort((a, b) => a.when.localeCompare(b.when)).slice(0, 4);
  const [lead, rest] = splitLead(data.pulse ? data.pulse.teamMoment : s.pulse.teamMoment);

  return (
    <section className="hc-section hc-exec-section" id="brief">
      <SectionHead eyebrow={`Executive brief · ${placeOf(team)} ${team.name}`} title="What to know" />
      <div className="hc-exec">
        <div className="hc-card hc-stack">
          <div>
            <div className="hc-row" style={{ justifyContent: "space-between" }}><div className="hc-kv-label">What sets this fan base apart</div><EvidenceTag kind="interpretation" /></div>
            <p style={{ fontWeight: 600, fontSize: "1.08rem" }}>{firstSentences(s.thesis, 2)}</p>
          </div>
          <div>
            <div className="hc-kv-label">The three best-supported insights</div>
            <ol className="hc-exec-list">
              {insights.map((t) => (
                <li key={t.i}>
                  <div>
                    <b>{t.title}</b>
                    <p className="hc-small" style={{ marginTop: 4 }}>{t.insight}</p>
                    <div className="hc-row" style={{ marginTop: 8 }}><EvidenceTag kind="interpretation" /><Strength support={t.support} /></div>
                    <Backing ids={t.support.ids} evidence={ev} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <div className="hc-kv-label">Three product and business implications</div>
            <ol className="hc-exec-list">
              {ideas.map((o) => (
                <li key={o.id}>
                  <div>
                    <a href={`#/m/${team.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`opp-${o.id}`)?.scrollIntoView({ behavior: "smooth" }); }} style={{ fontWeight: 700 }}>{o.title}</a>
                    <p className="hc-small" style={{ marginTop: 4 }}>{firstSentences(o.summary, 2)}</p>
                    <div className="hc-row" style={{ marginTop: 8 }}>
                      <Status status={o.handoff ? o.handoff.status : "hypothesis"} />
                      <Strength support={o.support} />
                      {o.handoff && <Route route={o.handoff.routes[0]} />}
                      {o.handoff && <Chip tone="line">Target {o.handoff.targetSeason}</Chip>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="hc-card-invert hc-stack">
          <div>
            <div className="hc-row" style={{ justifyContent: "space-between" }}><div className="hc-eyebrow">The team right now</div>{data.pulse ? <Chip tone="pop" title="From the League Pulse, checked on the live web">Checked live · {fmtDate(data.pulse.asOf)}</Chip> : <Chip tone="warn">Unverified</Chip>}</div>
            <div className="hc-h3" style={{ marginTop: 8 }}>{lead}</div>
            {rest && <p className="hc-small" style={{ marginTop: 6 }}>{rest}</p>}
            <div style={{ marginTop: 10 }}><Mood value={s.pulse.heat} /></div>
          </div>
          <div>
            <div className="hc-eyebrow">Coming up</div>
            {upcoming.length ? (
              <ul className="hc-list" style={{ marginTop: 8 }}>
                {upcoming.map((c, i) => <li key={i}><div className="hc-row"><Priority p={c.priority} /><b>{c.moment}</b></div><div className="hc-row" style={{ marginTop: 6 }}><When timing={c.timing} /><Certainty timing={c.timing} /></div></li>)}
              </ul>
            ) : <p className="hc-small hc-muted" style={{ marginTop: 6 }}>Nothing dated ahead.</p>}
          </div>
          <div>
            <div className="hc-eyebrow">Planning deadlines, next three months</div>
            {due.length ? (
              <ul className="hc-list" style={{ marginTop: 8 }}>
                {due.map((x) => <li key={x.key}><b>{x.title}</b><div className="hc-small" style={{ marginTop: 4 }}><span className="hc-actby">Act by {fmtDate(x.when)}</span></div>{x.note && <div className="hc-small hc-muted" style={{ marginTop: 4 }}>{x.note}</div>}</li>)}
              </ul>
            ) : <p className="hc-small hc-muted" style={{ marginTop: 6 }}>{s.calendar.some((c) => c.timing && c.timing.reviewed) ? "No deadlines in the brief for the next three months." : "Deadlines not reviewed for this market yet."}</p>}
          </div>
          <div>
            <div className="hc-eyebrow">Evidence status</div>
            <ul className="hc-bullets hc-small" style={{ marginTop: 8 }}>
              <li>{ev ? `${ev.claims.length} claims checked live on ${fmtDate(ev.checkedOn)}: ${count(ev.claims, "verified")} verified, ${count(ev.claims, "contradicted")} corrected, ${count(ev.claims, "unclear")} unsettled.` : "No claims checked live for this market yet."}</li>
              <li>{corrections.length ? `${corrections.length} correction${corrections.length > 1 ? "s" : ""} made at the source.` : "No corrections logged."}</li>
              <li>{ver.queue.length} dated claims in the desk research are still unverified.</li>
              <li>Team facts {data.pulse ? `checked live on ${fmtDate(data.pulse.asOf)}` : "not checked"}. Scores, fan mood and fan heat are editorial estimates.</li>
              <li>Owner {data.stewardship?.owner || "unassigned"}; reviewer {data.stewardship?.reviewer || "unassigned"}; no human sign-off{data.stewardship?.signedOff ? `: ${data.stewardship.signedOff}` : " yet"}.</li>
            </ul>
          </div>
        </div>
      </div>
      <details className="hc-fold hc-no-print">
        <summary>The full brief: thesis, all {s.topInsights.length} insights and the verified team facts</summary>
        <div className="hc-card"><p className="hc-lede" style={{ color: "var(--text)" }}>{s.thesis}</p></div>
        {data.pulse && <VerifiedSnapshot p={data.pulse} />}
        <div className="hc-grid hc-grid-3" style={{ marginTop: "var(--grid-gap)" }}>
          {s.topInsights.map((t, i) => (
            <article key={i} className="hc-card hc-insight">
              <span className="hc-insight-num">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="hc-h3">{t.title}</h3>
              <p>{t.insight}</p>
              <p className="hc-implication">{t.implication}</p>
              <Backing ids={t.support.ids} evidence={data.evidence} />
              <div className="hc-row" style={{ marginTop: "auto" }}>
                <EvidenceTag kind="interpretation" />
                <Strength support={t.support} />
                <span className="hc-tiny hc-muted">Drawn from: {t.evidence.map((e) => AGENT_BY_ID[e]?.name || e).join(", ")}</span>
              </div>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}

const count = (list, status) => list.filter((c) => c.status === status).length;

// The live-checked facts behind a read: what the source says, who published
// it and when, and when it was checked.
function Backing({ ids, evidence }) {
  if (!evidence || !ids || !ids.length) return null;
  const claims = ids.map((id) => evidence.claims.find((c) => c.id === id)).filter(Boolean);
  if (!claims.length) return null;
  return (
    <details className="hc-more" style={{ marginTop: 10 }}>
      <summary>The checked facts behind it ({claims.length})</summary>
      <ul className="hc-list">
        {claims.map((c) => (
          <li key={c.id} className="hc-small">
            <div className="hc-row"><Chip tone={c.status === "verified" ? "pop" : "ink"}>{c.status === "verified" ? "Verified fact" : "Corrected"}</Chip><span className="hc-tiny hc-muted">Checked {fmtDate(evidence.checkedOn)}</span></div>
            <div style={{ marginTop: 4 }}>{c.evidence}</div>
            <div className="hc-tiny" style={{ marginTop: 4 }}>{c.sources.map((x, i) => <React.Fragment key={i}>{i ? " · " : ""}<SourceLink s={x} /></React.Fragment>)}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ── The fan year: rhythm plus the calendar, by season and year ────────
function FanYear({ s, d, now }) {
  const seasons = [...new Set(s.calendar.map((c) => seasonOf(c.timing.start)))].sort();
  const [season, setSeason] = useState(seasons.includes(now.season) ? now.season : seasons[0]);
  const items = s.calendar.filter((c) => seasonOf(c.timing.start) === season);
  const byMonth = [...new Set(items.map((c) => ymOf(c.timing.start)))].sort().map((ym) => ({ ym, items: items.filter((c) => ymOf(c.timing.start) === ym).sort((a, b) => a.priority - b.priority) }));
  const reviewed = s.calendar.some((c) => c.timing.reviewed);
  return (
    <section className="hc-section" id="calendar">
      <SectionHead eyebrow="When to show up" title="The fan year">
        <span className="hc-row" role="group" aria-label="Season">
          {seasons.map((x) => <button key={x} className="hc-pill-btn" aria-pressed={season === x} onClick={() => setSeason(x)}>{x}{x === now.season ? " (now)" : ""}</button>)}
        </span>
      </SectionHead>
      <div className="hc-card">
        <p className="hc-small" style={{ marginBottom: 12, maxWidth: "70ch" }}>{d.rhythm.headline}</p>
        <RhythmChart months={d.rhythm.extra.months} calendar={items} now={season === now.season ? now.month : null} />
        <p className="hc-tiny hc-muted" style={{ marginTop: 8 }}>{SCORE_DEFS.rhythm.kind}. {SCORE_DEFS.rhythm.baseline} Dots are the plays dated to {season}.</p>
      </div>
      {!reviewed && <p className="hc-small" style={{ marginTop: 12 }}><Chip tone="warn">Timing not reviewed</Chip> Years come from the brief's order; treat every date as unknown.</p>}
      <div className="hc-grid hc-grid-3" style={{ marginTop: "var(--grid-gap)" }}>
        {byMonth.map(({ ym, items: list }) => (
          <div key={ym} className={ym === now.ym ? "hc-card-invert" : "hc-card"}>
            <div className="hc-row" style={{ justifyContent: "space-between" }}>
              <h3 className="hc-h2">{ymLabel(ym, true)}</h3>
              {ym === now.ym && <Chip tone="pop">Now</Chip>}
            </div>
            <ul className="hc-list" style={{ marginTop: 10 }}>
              {list.map((c, i) => (
                <li key={i}>
                  <div className="hc-row"><Priority p={c.priority} /><b>{c.moment}</b></div>
                  <div className="hc-row" style={{ marginTop: 6 }}><When timing={c.timing} /><Certainty timing={c.timing} /></div>
                  <div className="hc-small hc-muted" style={{ marginTop: 4 }}>{c.window} · {c.channel}</div>
                  <p className="hc-small" style={{ marginTop: 6 }}>{c.play}</p>
                  {c.timing.actBy && <div style={{ marginTop: 6 }}><ActBy timing={c.timing} /></div>}
                  <div className="hc-row" style={{ marginTop: 8 }}>
                    {c.timing.reviewed && <Route route={c.timing.route} />}
                    {c.products.map((p, k) => <Chip key={k} tone="line">{p}</Chip>)}
                  </div>
                  {c.timing.reviewed && c.timing.dependencies.length > 0 && <div className="hc-tiny hc-muted" style={{ marginTop: 6 }}>Depends on: {c.timing.dependencies.map((x) => DEPENDENCIES[x]).join(" · ")}</div>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <details className="hc-fold">
        <summary>Dates to know (desk research, unverified)</summary>
        <div className="hc-card">
          <ul className="hc-list">
            {[...d.rhythm.extra.keyDates].sort((a, b) => [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9].indexOf(a.month) - [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9].indexOf(b.month)).map((k, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 160px) 1fr", gap: 12 }}>
                <span className="hc-small" style={{ fontWeight: 700 }}>{k.date}</span>
                <span><b>{k.name}</b> <Chip tone="line">{k.type}</Chip><br /><span className="hc-small hc-muted">{k.why}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}

// ── Observed visual references (links, credited) ───────────────────
function References({ refs, title, insights }) {
  if (!refs || !refs.length) return null;
  return (
    <div className="hc-card" style={{ marginTop: "var(--grid-gap)" }}>
      <div className="hc-row" style={{ justifyContent: "space-between" }}><div className="hc-kv-label">{title}</div><Chip tone="line" title="Observed, existing things found by live search, kept apart from proposed concepts">Observed · sourced links</Chip></div>
      <p className="hc-tiny hc-muted" style={{ marginBottom: 10 }}>Things that exist, found by live search. Open the source to see them; images belong to their owners and aren't copied here.</p>
      <ul className="hc-list">
        {refs.map((r, i) => (
          <li key={i}>
            <div className="hc-row" style={{ justifyContent: "space-between" }}><b>{r.title}</b><Chip tone="line">{REFERENCE_KINDS[r.kind]}</Chip></div>
            <div className="hc-small" style={{ marginTop: 4 }}>{r.note}</div>
            <div className="hc-tiny hc-muted" style={{ marginTop: 4 }}>Credit: {r.credit} · <SourceLink s={r.source} />{r.supports.insights.length ? ` · Supports: ${r.supports.insights.map((k) => insights[k]?.title).filter(Boolean).join("; ")}` : ""}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The League Pulse entry: this team's 2026-27 situation, checked live.
const ABBREV = /(?:^|\s)(?:No|St|Mt|Ft|Jr|Sr|Dr|Mr|Mrs|Ms|vs|Inc|Co|U\.S|[A-Z])\.$/;
const splitLead = (text = "") => {
  for (const m of text.matchAll(/[.!?]\s+(?=[A-Z0-9"“'‘])/g)) {
    const head = text.slice(0, m.index + 1);
    if (!ABBREV.test(head)) return [head, text.slice(m.index + m[0].length)];
  }
  return [text, ""];
};
const firstSentences = (text = "", n = 2) => {
  let out = "", rest = text;
  for (let k = 0; k < n && rest; k++) { const [head, tail] = splitLead(rest); out += (out ? " " : "") + head; rest = tail; }
  return out;
};

function VerifiedSnapshot({ p }) {
  return (
    <div className="hc-card" style={{ marginTop: "var(--grid-gap)", background: "var(--hc-card)", boxShadow: "inset 0 0 0 1.5px var(--text)" }}>
      <div className="hc-row" style={{ justifyContent: "space-between" }}>
        <div className="hc-eyebrow">The team in 2026-27</div>
        <Chip tone="pop" title="Checked on the live web by the League Pulse agents">Verified facts · checked {fmtDate(p.asOf)}</Chip>
      </div>
      <p style={{ marginTop: 8, fontWeight: 600 }}>{p.teamMoment}</p>
      <div className="hc-grid hc-grid-4" style={{ marginTop: 14 }}>
        <KV label="Last season"><span className="hc-small">{p.lastSeason}</span></KV>
        <KV label="Head coach"><span className="hc-small">{p.headCoach}</span></KV>
        <KV label="Core players"><span className="hc-small">{p.stars.join(" · ")}</span></KV>
        <KV label="The outlook"><span className="hc-small">{p.expectations}</span></KV>
      </div>
      <div className="hc-grid hc-grid-3" style={{ marginTop: 14 }}>
        {p.keyMoves.length > 0 && <KV label="2026 offseason"><ul className="hc-bullets hc-small">{p.keyMoves.map((m, i) => <li key={i}>{m}</li>)}</ul></KV>}
        {p.marquee.length > 0 && <KV label="Big games"><ul className="hc-bullets hc-small">{p.marquee.map((m, i) => <li key={i}>{m}</li>)}</ul></KV>}
        <KV label="City Edition 2026-27"><span className="hc-small">{p.cityEdition || "Not revealed yet"}</span>{p.ownershipArena ? <div className="hc-small hc-muted" style={{ marginTop: 6 }}>{p.ownershipArena}</div> : null}</KV>
      </div>
      <div className="hc-tiny hc-muted" style={{ marginTop: 12 }}>Sources: {p.sources.map((x, i) => <React.Fragment key={i}>{i ? " · " : ""}<a href={x.url} target="_blank" rel="noreferrer">{x.title}</a></React.Fragment>)}</div>
    </div>
  );
}

function UniformArchive({ u }) {
  const x = u.extra;
  const tone = { loved: "pop", liked: "accent", mixed: undefined, disliked: "ink", unknown: "line" };
  return (
    <div className="hc-grid hc-grid-2">
      <div className="hc-card hc-stack">
        <div className="hc-row" style={{ justifyContent: "space-between" }}><div className="hc-eyebrow">The uniform archive</div><EvidenceTag kind="unverified" /></div>
        <h3 className="hc-h3">{u.headline}</h3>
        <PaletteRow palette={x.palette} />
        <div>
          <div className="hc-kv-label">Eras</div>
          <ul className="hc-list">{x.eras.map((e, i) => <li key={i}><b>{e.era}</b> — {e.look}<div className="hc-small hc-muted">{e.legacy}</div></li>)}</ul>
        </div>
        <KV label="Fan favorites (desk research)"><div className="hc-row">{x.fanFavorites.map((f, i) => <Chip key={i}>{f}</Chip>)}</div></KV>
      </div>
      <div className="hc-card hc-stack">
        <div className="hc-kv-label">Past City Editions and how they landed (desk research)</div>
        {x.cityEditions.length ? (
          <ul className="hc-list">{x.cityEditions.map((c, i) => <li key={i}><div className="hc-row" style={{ justifyContent: "space-between" }}><b>{c.season}</b><Chip tone={tone[c.reception]}>{c.reception}</Chip></div><div style={{ marginTop: 4 }}>{c.concept}</div><div className="hc-small hc-muted">{c.note}</div></li>)}</ul>
        ) : <p className="hc-muted">No past City Editions confirmed.</p>}
        <div>
          <div className="hc-kv-label">Stories no uniform has told yet</div>
          <ul className="hc-list">{x.untoldStories.map((s, i) => <li key={i}><b>{s.story}</b><div className="hc-small hc-muted">{s.why}</div></li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function Fanbase({ f, ev, insights }) {
  const x = f.extra;
  const heat = { "red-hot": "pop", strong: "accent", simmering: undefined, historic: "line" };
  const obs = ev ? ev.observations : [];
  const conflicts = obs.filter((o) => o.type === "conflict" || o.type === "segment");
  return (
    <>
      <div className="hc-card hc-stack">
        <div className="hc-row" style={{ justifyContent: "space-between" }}>
          <div><div className="hc-eyebrow">Fan evidence</div><h3 className="hc-h3" style={{ marginTop: 4 }}>What fans were seen wearing, saying and buying</h3></div>
          {obs.length > 0 && <Chip tone="line" title="Each item is what a dated source reported. It shows direction, not size or share.">Sourced observations · directional</Chip>}
        </div>
        {obs.length ? (
          <ul className="hc-list">
            {obs.filter((o) => !conflicts.includes(o)).map((o, i) => <Observation key={i} o={o} insights={insights} />)}
          </ul>
        ) : <p className="hc-small hc-muted">No observed fan evidence logged for this market yet. Everything about fans below is desk research. Treat it as a hypothesis about how fans dress and buy.</p>}
        {conflicts.length > 0 && (
          <div>
            <div className="hc-kv-label">Conflicting evidence and segment differences</div>
            <ul className="hc-list">{conflicts.map((o, i) => <Observation key={i} o={o} insights={insights} />)}</ul>
          </div>
        )}
      </div>
      <References refs={ev ? ev.references.filter((r) => r.kind === "fan-styling") : []} title="Observed references: fan styling" insights={insights} />

      <div className="hc-split" style={{ marginTop: "var(--grid-gap)" }}>
        <div className="hc-card hc-stack">
          <div className="hc-row" style={{ justifyContent: "space-between" }}><h3 className="hc-h3">{f.headline}</h3><EvidenceTag kind="unverified" /></div>
          <p>{f.summary}</p>
          <KV label="Mood heading into 2026-27">{x.sentiment}</KV>
          <KV label="The gameday look (desk research)">{x.gamedayLook}</KV>
        </div>
        <div className="hc-card-invert">
          <div className="hc-eyebrow">Rivalries</div>
          <ul className="hc-list" style={{ marginTop: 8 }}>{x.rivalries.map((r, i) => <li key={i}><div className="hc-row"><b>{r.opponent}</b><Chip tone={heat[r.heat]}>{r.heat}</Chip></div><div className="hc-small hc-muted" style={{ marginTop: 4 }}>{r.why}</div></li>)}</ul>
        </div>
      </div>
      <details className="hc-fold">
        <summary>The crowd by type, traditions and legends (desk research)</summary>
        <p className="hc-small hc-muted" style={{ marginBottom: 14, maxWidth: "80ch" }}>These segments are a desk-research sketch, not a survey. Their sizes were never measured, so none are shown. A city has more than one look: women, younger fans, families and style-led buyers may dress differently from the crowd described here.</p>
        <div className="hc-grid hc-grid-3">
          {x.segments.map((sg, i) => (
            <div key={i} className="hc-card hc-stack">
              <h4 className="hc-h3">{sg.name}</h4>
              <p className="hc-small">{sg.description}</p>
              <KV label="Wears">{sg.wears}</KV>
              <KV label="Where to find them">{sg.reach}</KV>
            </div>
          ))}
        </div>
        <div className="hc-grid hc-grid-2" style={{ marginTop: "var(--grid-gap)" }}>
          <div className="hc-card"><div className="hc-kv-label">Traditions</div><ul className="hc-list">{x.traditions.map((t, i) => <li key={i}><b>{t.name}</b><div className="hc-small hc-muted">{t.detail}</div></li>)}</ul></div>
          <div className="hc-card"><div className="hc-kv-label">Legends</div><ul className="hc-list">{x.icons.map((t, i) => <li key={i}><b>{t.name}</b> <span className="hc-muted hc-small">· {t.era}</span><div className="hc-small hc-muted">{t.why}</div></li>)}</ul></div>
        </div>
        <div style={{ marginTop: "var(--grid-gap)" }}><LensView dossier={f} compact /></div>
      </details>
    </>
  );
}

function Observation({ o, insights }) {
  return (
    <li>
      <div className="hc-row"><Chip tone="line">{EVIDENCE_TYPES[o.type]}</Chip><span className="hc-tiny hc-muted">{o.timeframe}</span></div>
      <p className="hc-small" style={{ marginTop: 6 }}>{o.observation}</p>
      <div className="hc-tiny hc-muted" style={{ marginTop: 4 }}>Whose view: {o.audience}. Limits: {o.limitations}</div>
      <div className="hc-tiny" style={{ marginTop: 4 }}><SourceLink s={o.source} />{o.supports.insights.length ? <span className="hc-muted"> · Bears on: {o.supports.insights.map((k) => insights[k]?.title).filter(Boolean).join("; ")}</span> : null}</div>
    </li>
  );
}

function Retail({ land, beh }) {
  const lx = land.extra, bx = beh.extra;
  const impact = { high: "pop", medium: undefined, low: "line" };
  return (
    <>
      <div className="hc-grid hc-grid-2">
        <div className="hc-card hc-stack">
          <div className="hc-eyebrow">Where they shop</div>
          <h3 className="hc-h3">{land.headline}</h3>
          <ul className="hc-list">{lx.districts.map((x, i) => <li key={i}><div className="hc-row" style={{ justifyContent: "space-between" }}><b>{x.name}</b><Chip tone="line">{x.role}</Chip></div><div className="hc-small" style={{ marginTop: 4 }}>{x.profile}</div><div className="hc-small hc-muted">Who shops here: {x.shopper}</div></li>)}</ul>
        </div>
        <div className="hc-card hc-stack">
          <div className="hc-row" style={{ justifyContent: "space-between" }}><div className="hc-eyebrow">Stores that matter</div><EvidenceTag kind="unverified" /></div>
          <ul className="hc-list">{lx.doors.map((x, i) => <li key={i}><div className="hc-row" style={{ justifyContent: "space-between" }}><b>{x.name}</b><Chip tone={x.type === "nike-owned" ? "accent" : "line"}>{x.type.replace(/-/g, " ")}</Chip></div><div className="hc-small hc-muted">{x.neighborhood}</div><div className="hc-small" style={{ marginTop: 2 }}>{x.why}</div></li>)}</ul>
        </div>
      </div>
      <div className="hc-grid hc-grid-2" style={{ marginTop: "var(--grid-gap)" }}>
        <div className="hc-card hc-stack">
          <div className="hc-eyebrow">When they shop</div>
          <h3 className="hc-h3">{beh.headline}</h3>
          <ul className="hc-list">{[...bx.calendar].sort((a, b) => a.month - b.month).map((c, i) => <li key={i} style={{ display: "grid", gridTemplateColumns: "48px 1fr auto", gap: 10, alignItems: "start" }}><b>{MONTHS[c.month - 1]}</b><span><span className="hc-small" style={{ fontWeight: 600 }}>{c.window}</span><div className="hc-small hc-muted">{c.driver}</div></span><Chip tone={impact[c.impact]}>{c.impact}</Chip></li>)}</ul>
        </div>
        <div className="hc-card hc-stack">
          <div className="hc-eyebrow">How they shop</div>
          <ul className="hc-list">{bx.channels.map((c, i) => <li key={i}><b>{c.channel}</b><div className="hc-small hc-muted">{c.role}</div></li>)}</ul>
          <KV label="What they'll pay">{bx.priceProfile}</KV>
          <KV label="How fans buy jerseys">{bx.jerseyBehavior}</KV>
        </div>
      </div>
      <div className="hc-grid hc-grid-2" style={{ marginTop: "var(--grid-gap)" }}>
        <LensView dossier={land} compact />
        <LensView dossier={beh} compact />
      </div>
    </>
  );
}

const SEVERITY = { high: "serious", medium: "moderate", low: "minor" };
const CLAIM_TONE = { verified: "pop", contradicted: "ink", unclear: "warn" };

function Review({ data, ver, corrections }) {
  const fc = data.review && data.review.factcheck;
  const cr = data.review && data.review.critique;
  const ev = data.evidence;
  const [qOpen, setQOpen] = useState(false);
  const counts = fc ? ["confirmed", "corrected", "removed", "unverifiable"].map((k) => [k, fc.verdicts.filter((v) => v.verdict === k).length]) : [];
  const allSources = LENS_AGENTS.map((a) => ({ a, d: data.dossiers[a.id] }));
  return (
    <>
      <div className="hc-card hc-stack">
        <div className="hc-row" style={{ justifyContent: "space-between" }}>
          <div><div className="hc-eyebrow">Checked live{ev ? ` · ${fmtDate(ev.checkedOn)}` : ""}</div><h3 className="hc-h3" style={{ marginTop: 4 }}>{ev ? `${ev.claims.length} claims checked against live sources` : "No live checks for this market yet"}</h3></div>
          {ev && <div className="hc-row">{["verified", "contradicted", "unclear"].map((k) => <Chip key={k} tone={CLAIM_TONE[k]} title={CLAIM_STATUS[k]}>{count(ev.claims, k)} {k === "contradicted" ? "corrected" : k === "unclear" ? "unsettled" : k}</Chip>)}</div>}
        </div>
        <p className="hc-small hc-muted">A claim counts as verified only when a dated source returned by a live search states it. The research environment can't open pages directly, so each check records what the search returned and the link to open. Searches were capped, so most of the desk research is still unchecked.</p>
        {ev && ev.claims.length > 0 && (
          <ul className="hc-list">
            {ev.claims.map((c) => (
              <li key={c.id}>
                <div className="hc-row"><Chip tone={CLAIM_TONE[c.status]}>{c.status === "contradicted" ? "Corrected" : c.status === "unclear" ? "Unsettled" : "Verified"}</Chip><span className="hc-tiny hc-muted">{c.topic.replace(/-/g, " ")}</span></div>
                <div className="hc-small" style={{ marginTop: 4, fontWeight: 600 }}>{c.claim}</div>
                <div className="hc-small hc-muted">{c.evidence}{c.action && c.action !== "No change needed" ? ` ${c.action}` : ""}</div>
                {c.sources.length > 0 && <div className="hc-tiny" style={{ marginTop: 4 }}>{c.sources.map((x, i) => <React.Fragment key={i}>{i ? " · " : ""}<SourceLink s={x} /></React.Fragment>)}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {corrections.length > 0 && (
        <div className="hc-card-invert hc-stack" style={{ marginTop: "var(--grid-gap)" }}>
          <div className="hc-eyebrow">Corrections log</div>
          <ul className="hc-list">
            {corrections.map((c, i) => (
              <li key={i}>
                <div className="hc-small"><b>Was:</b> {c.was}</div>
                <div className="hc-small" style={{ marginTop: 4 }}><b>Now:</b> {c.now}</div>
                <div className="hc-tiny hc-muted" style={{ marginTop: 4 }}>Found {fmtDate(c.found)} · changed in {c.files.join(", ")}{c.sources.length ? " · " : ""}{c.sources.map((x, k) => <React.Fragment key={k}>{k ? " · " : ""}<SourceLink s={x} /></React.Fragment>)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ver.queue.length > 0 && (
        <div className="hc-card" style={{ marginTop: "var(--grid-gap)" }}>
          <div className="hc-row" style={{ justifyContent: "space-between" }}>
            <div><div className="hc-eyebrow">Still unverified</div><h3 className="hc-h3" style={{ marginTop: 4 }}>{ver.queue.length} claims to check before you act on them</h3></div>
            <button className="hc-pill-btn hc-no-print" onClick={() => setQOpen(!qOpen)} aria-expanded={qOpen}>{qOpen ? "Hide" : "Show"} the list</button>
          </div>
          {qOpen && <ul className="hc-list" style={{ marginTop: 10 }}>{ver.queue.map((q, i) => <li key={i}><span className="hc-small hc-muted">{AGENT_BY_ID[q.lens]?.name || "Brief"} · </span>{q.claim}{q.note ? <div className="hc-small hc-muted">{q.note}</div> : null}</li>)}</ul>}
        </div>
      )}

      <details className="hc-fold">
        <summary>The agents' own fact-check and authenticity review (model knowledge)</summary>
        <div className="hc-grid hc-grid-2">
          <div className="hc-card hc-stack">
            <div className="hc-eyebrow">The fact-check agent</div>
            <p className="hc-small hc-muted">Mostly worked from model knowledge, with a few live spot-checks. Its "confirmed" means the agent agreed, not that a source was checked. In New York it introduced an error that has since been corrected.</p>
            {fc ? (
              <>
                <div className="hc-row">{counts.map(([k, n]) => <Chip key={k} tone="line">{n} {k}</Chip>)}</div>
                <p className="hc-small">{fc.summary}</p>
                <ul className="hc-list">{fc.verdicts.map((v, i) => <li key={i}><div className="hc-row"><Chip tone="line">{v.verdict}</Chip><span className="hc-small hc-muted">{AGENT_BY_ID[v.lens]?.name || v.lens}</span></div><div className="hc-small" style={{ marginTop: 4 }}>{v.claim}</div><div className="hc-small hc-muted">{v.note}{v.source ? <> · <a href={v.source} target="_blank" rel="noreferrer">source</a></> : null}</div></li>)}</ul>
              </>
            ) : <p className="hc-muted">No fact-check for this run.</p>}
          </div>
          <div className="hc-card hc-stack">
            <div className="hc-eyebrow">The authenticity check</div>
            {cr ? (
              <>
                <p className="hc-small">{cr.summary}</p>
                <div className="hc-row">{["high", "medium", "low"].map((sv) => <Chip key={sv} tone="line">{cr.issues.filter((x) => x.severity === sv).length} {SEVERITY[sv]}</Chip>)}</div>
                <ul className="hc-list">{cr.issues.map((x, i) => <li key={i}><div className="hc-row"><Chip tone={x.severity === "high" ? "pop" : "line"}>{x.type}</Chip><span className="hc-small hc-muted">{x.target}</span></div><div className="hc-small" style={{ marginTop: 4 }}>{x.problem}</div><div className="hc-small hc-muted">The editor's fix: {x.fix}</div></li>)}</ul>
              </>
            ) : <p className="hc-muted">No authenticity check for this run.</p>}
          </div>
        </div>
      </details>

      <details className="hc-fold">
        <summary>Reading list from the research agents (links not opened or checked)</summary>
        <div className="hc-card">
          <p className="hc-small hc-muted" style={{ marginBottom: 12 }}>The agents wrote most dossiers from model knowledge and listed these pages as where to verify them. Nobody has opened them, so they are not sources for anything on this page.</p>
          <div className="hc-grid hc-grid-3">
            {allSources.map(({ a, d }) => d && (
              <div key={a.id}>
                <div className="hc-row" style={{ marginBottom: 6 }}><b className="hc-small">{a.name}</b><Provenance of={d} /></div>
                <ul className="hc-bullets hc-tiny">{d.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </details>
    </>
  );
}
