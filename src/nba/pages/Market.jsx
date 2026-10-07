// One market, top to bottom: the brief (what to know), opportunities (where /
// when / how / which products), the activation calendar, product direction
// (collection + City Edition), then the agent dossiers that back it all up.
import React, { useEffect, useMemo, useState } from "react";
import { loadMarket, loadLiveRun, clearLiveRun, currentMonth, inkOn, heroColor, MONTHS, MONTHS_LONG, SEASON_ORDER } from "../data.js";
import { TEAM_BY_ID } from "../teams.js";
import { AGENT_BY_ID, LENS_AGENTS } from "../agents/roster.js";
import { Chip, Scorecard, PaletteRow, MonthStrip, Priority, Confidence, Provenance, SectionHead, KV, href } from "../ui.jsx";
import { verificationOf } from "../agents/provenance.js";
import { RhythmChart } from "../charts.jsx";
import { LensView, Jersey } from "./parts.jsx";

const SECTIONS = [
  ["brief", "Brief"], ["opportunities", "Opportunities"], ["calendar", "Calendar"], ["product", "Product"],
  ["fandom", "Fandom"], ["culture", "Culture"], ["retail", "Retail"], ["partners", "Partners & risks"], ["review", "Agent review"],
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
  const data = useLive && liveComplete ? live : published;

  if (!team) return <div className="hc-empty">Unknown market.</div>;
  if (published === undefined) return <div className="hc-empty">Loading {team.city}…</div>;
  if (!data) {
    return (
      <div className="hc-empty">
        <h1 className="hc-h1" style={{ color: "var(--text)" }}>{team.city} {team.name}</h1>
        <p style={{ marginTop: 12 }}>The agents haven't published this market yet.</p>
        <p style={{ marginTop: 16 }}><a className="hc-btn" style={{ textDecoration: "none", display: "inline-block" }} href={href("agents", team.id)}>Run the agents live</a></p>
      </div>
    );
  }
  return <MarketView team={team} data={data} live={liveComplete ? live : null} useLive={useLive} setUseLive={setUseLive} active={active}
    onDiscardLive={() => { clearLiveRun(id); setLive(null); setUseLive(false); }} />;
}

function MarketView({ team, data, live, useLive, setUseLive, active, onDiscardLive }) {
  const s = data.strategy;
  const d = data.dossiers;
  const now = currentMonth();
  const bg = heroColor(team);
  const ink = inkOn(bg);
  const [lens, setLens] = useState("music");
  const ver = useMemo(() => verificationOf(data), [data]);

  const calendarBySeason = useMemo(() => SEASON_ORDER.map((m) => ({ m, items: s.calendar.filter((c) => c.month === m).sort((a, b) => a.priority - b.priority) })).filter((x) => x.items.length), [s]);
  const opps = useMemo(() => [...s.opportunities].sort((a, b) => a.priority - b.priority), [s]);
  const nowItems = s.calendar.filter((c) => c.month === now || c.month === (now % 12) + 1);

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
            <h1 className="hc-display hc-hero-city">{team.city}</h1>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, textTransform: "uppercase", fontSize: "clamp(1.6rem, 3.6vw, 2.8rem)", lineHeight: 1, marginTop: 6, opacity: 0.85 }}>{team.name}</div>
            <p style={{ marginTop: 22, fontSize: "clamp(1.1rem, 1.8vw, 1.5rem)", lineHeight: 1.3, fontWeight: 600, maxWidth: "34ch" }}>{s.headline}</p>
          </div>
          <div className="hc-hero-panel">
            <div className="hc-eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>Fandom archetype</div>
            <div className="hc-h3" style={{ marginTop: 4 }}>{s.archetype.name}</div>
            <p className="hc-small" style={{ marginTop: 6, color: "rgba(255,255,255,0.82)" }}>{s.archetype.description}</p>
            <hr className="hc-divider" style={{ background: "rgba(255,255,255,0.18)" }} />
            <Scorecard scorecard={s.scorecard} />
            <div className="hc-tiny" style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>{s.scorecard.calibrated ? "Calibrated across all 30 markets" : "Strategist's estimate"} · 50 = league-average market</div>
          </div>
        </div>
      </section>

      {live && (
        <div className="hc-banner hc-no-print" role="status">
          <span>A live agent run from {new Date(live.ranAt).toLocaleString()} is saved in this browser.</span>
          <span className="hc-row">
            <button className="hc-pill-btn" aria-pressed={!useLive} onClick={() => setUseLive(false)}>Published research</button>
            <button className="hc-pill-btn" aria-pressed={useLive} onClick={() => setUseLive(true)}>Live run</button>
            <button className="hc-pill-btn" onClick={onDiscardLive}>Discard</button>
          </span>
        </div>
      )}

      {ver.knowledge.length > 0 && (
        <div className="hc-notice" role="note">
          <b>{ver.knowledge.length === 11 ? "Knowledge draft." : `Partly verified: ${ver.live.length} of 11 dossiers verified on the live web.`}</b>{" "}
          {ver.knowledge.length} of 11 dossiers{ver.briefMode === "knowledge" ? " and the brief" : ""} were written from agent knowledge (current to mid-2026) because live web research was unavailable for that run{data.pulse ? `; the 2026-27 team facts they use were verified live on ${data.pulse.asOf}` : ""}. {ver.queue.length} time-sensitive claims are queued for live verification.{" "}
          <a href={`#/m/${team.id}`} onClick={(e) => { e.preventDefault(); document.getElementById("review")?.scrollIntoView({ behavior: "smooth" }); }}>See the queue</a> or <a href={href("agents", team.id)}>re-run the agents live</a>.
        </div>
      )}

      <nav className="hc-subnav hc-no-print" aria-label="Sections">
        {SECTIONS.map(([sid, label]) => <a key={sid} href={`#/m/${team.id}`} className={active === sid ? "is-active" : ""} onClick={(e) => { e.preventDefault(); document.getElementById(sid)?.scrollIntoView({ behavior: "smooth" }); }}>{label}</a>)}
        <a href={href("compare", team.id)} style={{ marginLeft: "auto" }}>Compare</a>
        <a href={`#/m/${team.id}`} onClick={(e) => { e.preventDefault(); window.print(); }}>Print brief</a>
      </nav>

      {/* ── Brief ────────────────────────────────────── */}
      <section className="hc-section" id="brief">
        <SectionHead eyebrow="The brief" title="What to know" />
        <div className="hc-split">
          <div className="hc-card">
            <p className="hc-lede" style={{ color: "var(--text)" }}>{s.thesis}</p>
          </div>
          <div className="hc-card-invert">
            <div className="hc-eyebrow">Pulse · {data.updated ? `as of ${data.updated}` : "2026-27"}</div>
            <div className="hc-h3" style={{ marginTop: 8 }}>{s.pulse.teamMoment}</div>
            <p className="hc-small hc-muted" style={{ marginTop: 10 }}>{s.pulse.sentiment}</p>
            <div style={{ marginTop: 14 }}><div className="hc-meter" style={{ gridTemplateColumns: "84px 1fr 26px" }}><span>Fan heat now</span><span className="hc-meter-track"><span className="hc-meter-fill" style={{ display: "block", width: `${s.pulse.heat}%` }} /></span><span className="hc-meter-value">{s.pulse.heat}</span></div></div>
            {nowItems.length > 0 && (
              <>
                <hr className="hc-divider" style={{ background: "#2a2a2a" }} />
                <div className="hc-eyebrow">Activate next</div>
                <ul className="hc-list" style={{ marginTop: 8 }}>
                  {nowItems.slice(0, 3).map((c, i) => <li key={i}><div className="hc-row"><Priority p={c.priority} /><b>{c.moment}</b></div><div className="hc-small hc-muted" style={{ marginTop: 4 }}>{c.window} · {c.play}</div></li>)}
                </ul>
              </>
            )}
          </div>
        </div>
        {data.pulse && <VerifiedSnapshot p={data.pulse} />}
        <div className="hc-grid hc-grid-3" style={{ marginTop: "var(--grid-gap)" }}>
          {s.topInsights.map((t, i) => (
            <article key={i} className="hc-card hc-insight">
              <span className="hc-insight-num">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="hc-h3">{t.title}</h3>
              <p>{t.insight}</p>
              <p className="hc-implication">{t.implication}</p>
              <div className="hc-row" style={{ marginTop: "auto" }}>
                {t.evidence.map((e) => <Chip key={e} tone="line">{AGENT_BY_ID[e]?.name || e}</Chip>)}
                <Confidence level={t.confidence} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Opportunities ────────────────────────────── */}
      <section className="hc-section" id="opportunities">
        <SectionHead eyebrow="Where · when · how · which products" title="Opportunities" />
        <div className="hc-grid hc-grid-2">
          {opps.map((o) => (
            <article key={o.id} className="hc-card hc-opp">
              <div className="hc-row" style={{ justifyContent: "space-between" }}>
                <div className="hc-row"><Priority p={o.priority} /><Chip tone="line">{o.size} upside</Chip></div>
                <span className="hc-small hc-muted">{o.segment}</span>
              </div>
              <h3 className="hc-h2" style={{ fontSize: "clamp(1.4rem, 2.2vw, 1.8rem)" }}>{o.title}</h3>
              <p>{o.summary}</p>
              <div className="hc-opp-grid">
                <KV label="Where"><ul className="hc-bullets">{o.where.map((w, i) => <li key={i}>{w}</li>)}</ul></KV>
                <KV label="When"><p style={{ marginBottom: 8 }}>{o.when}</p><MonthStrip months={o.months} /></KV>
                <KV label="How"><p>{o.how}</p></KV>
                <KV label="Products"><div className="hc-row">{o.products.map((p, i) => <Chip key={i}>{p}</Chip>)}</div></KV>
              </div>
              <div className="hc-small hc-muted"><b style={{ color: "var(--text)" }}>Measure:</b> {o.kpi}</div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Calendar ─────────────────────────────────── */}
      <section className="hc-section" id="calendar">
        <SectionHead eyebrow="When to activate" title="Fan rhythm & activation calendar" />
        <div className="hc-card">
          <p className="hc-small" style={{ marginBottom: 12, maxWidth: "70ch" }}>{d.rhythm.headline}</p>
          <RhythmChart months={d.rhythm.extra.months} calendar={s.calendar} now={now} />
        </div>
        <div className="hc-grid hc-grid-3" style={{ marginTop: "var(--grid-gap)" }}>
          {calendarBySeason.map(({ m, items }) => (
            <div key={m} className={m === now ? "hc-card-invert" : "hc-card"}>
              <div className="hc-row" style={{ justifyContent: "space-between" }}>
                <h3 className="hc-h2">{MONTHS_LONG[m - 1]}</h3>
                {m === now && <Chip tone="pop">Now</Chip>}
              </div>
              <ul className="hc-list" style={{ marginTop: 10 }}>
                {items.map((c, i) => (
                  <li key={i}>
                    <div className="hc-row"><Priority p={c.priority} /><b>{c.moment}</b></div>
                    <div className="hc-small hc-muted" style={{ marginTop: 4 }}>{c.window} · {c.channel}</div>
                    <p className="hc-small" style={{ marginTop: 6 }}>{c.play}</p>
                    <div className="hc-row" style={{ marginTop: 8 }}>{c.products.map((p, k) => <Chip key={k} tone="line">{p}</Chip>)}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="hc-card" style={{ marginTop: "var(--grid-gap)" }}>
          <h3 className="hc-h3">Key dates, {SEASON_LABEL}</h3>
          <ul className="hc-list" style={{ marginTop: 12 }}>
            {[...d.rhythm.extra.keyDates].sort((a, b) => SEASON_ORDER.indexOf(a.month) - SEASON_ORDER.indexOf(b.month)).map((k, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 160px) 1fr", gap: 12 }}>
                <span className="hc-small" style={{ fontWeight: 700 }}>{k.date}</span>
                <span><b>{k.name}</b> <Chip tone="line">{k.type}</Chip><br /><span className="hc-small hc-muted">{k.why}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Product ──────────────────────────────────── */}
      <section className="hc-section" id="product">
        <SectionHead eyebrow="Apparel & uniform direction" title="Product" />
        <div className="hc-card-invert">
          <div className="hc-eyebrow">Collection</div>
          <h3 className="hc-display" style={{ fontSize: "clamp(2.2rem, 5vw, 3.8rem)", marginTop: 6 }}>{s.collection.name}</h3>
          <p className="hc-lede" style={{ color: "var(--text-muted-invert)", marginTop: 10 }}>{s.collection.story}</p>
        </div>
        <div className="hc-grid hc-grid-2" style={{ marginTop: "var(--grid-gap)" }}>
          {s.collection.themes.map((t, i) => (
            <article key={i} className="hc-card hc-stack">
              <div className="hc-eyebrow">Theme {i + 1} · for {t.segment}</div>
              <h4 className="hc-h2">{t.name}</h4>
              <p>{t.story}</p>
              <PaletteRow palette={t.palette} />
              <KV label="Graphics">{t.graphics}</KV>
              <KV label="Materials & trims">{t.materials}</KV>
              <div>
                <div className="hc-kv-label">Key pieces</div>
                <ul className="hc-list">
                  {t.pieces.map((p, k) => <li key={k}><div className="hc-row" style={{ justifyContent: "space-between" }}><b>{p.item}</b><span className="hc-row"><Chip tone="line">{p.category}</Chip><Chip tone={p.tier === "limited" ? "pop" : p.tier === "premium" ? "ink" : undefined}>{p.tier}</Chip></span></div><div className="hc-small hc-muted" style={{ marginTop: 4 }}>{p.detail}</div></li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <div className="hc-card" style={{ marginTop: "var(--grid-gap)" }}>
          <div className="hc-split" style={{ alignItems: "start" }}>
            <div className="hc-stack">
              <div className="hc-eyebrow">City Edition brief</div>
              <h3 className="hc-display" style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)" }}>{s.uniform.concept}</h3>
              <p className="hc-lede" style={{ color: "var(--text)" }}>{s.uniform.narrative}</p>
              <PaletteRow palette={s.uniform.palette} />
              <KV label="Motifs"><div className="hc-row">{s.uniform.motifs.map((m, i) => <Chip key={i}>{m}</Chip>)}</div></KV>
              <KV label="Typography">{s.uniform.typography}</KV>
              <KV label="Details"><ul className="hc-bullets">{s.uniform.details.map((x, i) => <li key={i}>{x}</li>)}</ul></KV>
              <KV label="Avoid"><ul className="hc-bullets">{s.uniform.avoid.map((x, i) => <li key={i}>{x}</li>)}</ul></KV>
              <KV label="Alternate concepts"><ul className="hc-list">{s.uniform.alternates.map((a, i) => <li key={i}><b>{a.name}</b> — {a.idea}</li>)}</ul></KV>
            </div>
            <div>
              <Jersey palette={s.uniform.palette} team={team} />
              <p className="hc-tiny hc-muted" style={{ textAlign: "center", marginTop: 10 }}>Palette study generated from the brief — not a design.</p>
            </div>
          </div>
        </div>

        <UniformArchive u={d.uniform} />
      </section>

      {/* ── Fandom ───────────────────────────────────── */}
      <section className="hc-section" id="fandom">
        <SectionHead eyebrow="Who the fans are" title="Fandom" />
        <Fanbase f={d.fanbase} />
      </section>

      {/* ── Culture ──────────────────────────────────── */}
      <section className="hc-section" id="culture">
        <SectionHead eyebrow="Six scene agents" title="Local culture" />
        <div className="hc-tabs" role="tablist">
          {CULTURE_LENSES.map((l) => <button key={l} role="tab" aria-selected={lens === l} aria-pressed={lens === l} className="hc-pill-btn" onClick={() => setLens(l)}>{AGENT_BY_ID[l].name}</button>)}
        </div>
        <LensView dossier={d[lens]} />
      </section>

      {/* ── Retail ───────────────────────────────────── */}
      <section className="hc-section" id="retail">
        <SectionHead eyebrow="Where, when and how they shop" title="Retail">
          <a className="hc-btn hc-btn-ghost hc-no-print" style={{ textDecoration: "none" }} href={`/?city=${encodeURIComponent(`${team.city}, ${team.state}`)}`}>Plan a scouting trip in Scout ↗</a>
        </SectionHead>
        <div className="hc-grid hc-grid-3">
          {[["Where to win", s.retailPlaybook.where], ["When to win", s.retailPlaybook.when], ["How to win", s.retailPlaybook.how]].map(([t, items]) => (
            <div key={t} className="hc-card-invert"><h3 className="hc-h2">{t}</h3><ul className="hc-list" style={{ marginTop: 10 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          ))}
        </div>
        <Retail land={d["retail-landscape"]} beh={d["retail-behavior"]} />
      </section>

      {/* ── Partners & risks ─────────────────────────── */}
      <section className="hc-section" id="partners">
        <SectionHead eyebrow="Who to build with · what to watch" title="Partners & risks" />
        <div className="hc-split">
          <div className="hc-grid hc-grid-2">
            {s.partners.map((p, i) => (
              <div key={i} className="hc-card hc-stack">
                <Chip tone="line">{p.type}</Chip>
                <h3 className="hc-h3">{p.name}</h3>
                <p className="hc-small hc-muted">{p.why}</p>
                <p className="hc-implication">{p.idea}</p>
              </div>
            ))}
          </div>
          <div className="hc-card-invert">
            <h3 className="hc-h2">Risks</h3>
            <ul className="hc-list" style={{ marginTop: 10 }}>{s.risks.map((r, i) => <li key={i}><b>{r.risk}</b><div className="hc-small hc-muted" style={{ marginTop: 4 }}>{r.mitigation}</div></li>)}</ul>
            <hr className="hc-divider" style={{ background: "#2a2a2a" }} />
            <p className="hc-small hc-muted">{s.scorecard.rationale}</p>
          </div>
        </div>
      </section>

      {/* ── Agent review ─────────────────────────────── */}
      <section className="hc-section" id="review">
        <SectionHead eyebrow="How this was made" title="Agent review">
          <a className="hc-btn hc-btn-ghost hc-no-print" style={{ textDecoration: "none" }} href={href("agents", team.id)}>Re-run agents live</a>
        </SectionHead>
        <Review data={data} ver={ver} />
      </section>
    </div>
  );
}

const SEASON_LABEL = "2026-27";

// The League Pulse entry: this team's 2026-27 situation, verified live.
function VerifiedSnapshot({ p }) {
  return (
    <div className="hc-card" style={{ marginTop: "var(--grid-gap)", background: "var(--hc-card)", boxShadow: "inset 0 0 0 1.5px var(--text)" }}>
      <div className="hc-row" style={{ justifyContent: "space-between" }}>
        <div className="hc-eyebrow">2026-27 snapshot</div>
        <Chip tone="pop" title="Researched on the live web by the League Pulse agents">Live-verified · {p.asOf}</Chip>
      </div>
      <p style={{ marginTop: 8, fontWeight: 600 }}>{p.teamMoment}</p>
      <div className="hc-grid hc-grid-4" style={{ marginTop: 14 }}>
        <KV label="Last season"><span className="hc-small">{p.lastSeason}</span></KV>
        <KV label="Head coach"><span className="hc-small">{p.headCoach}</span></KV>
        <KV label="Core players"><span className="hc-small">{p.stars.join(" · ")}</span></KV>
        <KV label="Expectations"><span className="hc-small">{p.expectations}</span></KV>
      </div>
      <div className="hc-grid hc-grid-3" style={{ marginTop: 14 }}>
        {p.keyMoves.length > 0 && <KV label="2026 offseason"><ul className="hc-bullets hc-small">{p.keyMoves.map((m, i) => <li key={i}>{m}</li>)}</ul></KV>}
        {p.marquee.length > 0 && <KV label="Marquee games"><ul className="hc-bullets hc-small">{p.marquee.map((m, i) => <li key={i}>{m}</li>)}</ul></KV>}
        <KV label="City Edition 2026-27"><span className="hc-small">{p.cityEdition || "Not yet revealed"}</span>{p.ownershipArena ? <div className="hc-small hc-muted" style={{ marginTop: 6 }}>{p.ownershipArena}</div> : null}</KV>
      </div>
      <div className="hc-tiny hc-muted" style={{ marginTop: 12 }}>Sources: {p.sources.map((x, i) => <React.Fragment key={i}>{i ? " · " : ""}<a href={x.url} target="_blank" rel="noreferrer">{x.title}</a></React.Fragment>)}</div>
    </div>
  );
}

function UniformArchive({ u }) {
  const x = u.extra;
  const tone = { loved: "pop", liked: "accent", mixed: undefined, disliked: "ink", unknown: "line" };
  return (
    <div className="hc-grid hc-grid-2" style={{ marginTop: "var(--grid-gap)" }}>
      <div className="hc-card hc-stack">
        <div className="hc-eyebrow">Uniform archive</div>
        <h3 className="hc-h3">{u.headline}</h3>
        <PaletteRow palette={x.palette} />
        <div>
          <div className="hc-kv-label">Eras</div>
          <ul className="hc-list">{x.eras.map((e, i) => <li key={i}><b>{e.era}</b> — {e.look}<div className="hc-small hc-muted">{e.legacy}</div></li>)}</ul>
        </div>
        <KV label="Fan favorites"><div className="hc-row">{x.fanFavorites.map((f, i) => <Chip key={i}>{f}</Chip>)}</div></KV>
      </div>
      <div className="hc-card hc-stack">
        <div className="hc-kv-label">City Edition history</div>
        {x.cityEditions.length ? (
          <ul className="hc-list">{x.cityEditions.map((c, i) => <li key={i}><div className="hc-row" style={{ justifyContent: "space-between" }}><b>{c.season}</b><Chip tone={tone[c.reception]}>{c.reception}</Chip></div><div style={{ marginTop: 4 }}>{c.concept}</div><div className="hc-small hc-muted">{c.note}</div></li>)}</ul>
        ) : <p className="hc-muted">No City Edition history verified.</p>}
        <div>
          <div className="hc-kv-label">Stories not yet told on a uniform</div>
          <ul className="hc-list">{x.untoldStories.map((s, i) => <li key={i}><b>{s.story}</b><div className="hc-small hc-muted">{s.why}</div></li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function Fanbase({ f }) {
  const x = f.extra;
  const heat = { "red-hot": "pop", strong: "accent", simmering: undefined, historic: "line" };
  return (
    <>
      <div className="hc-split">
        <div className="hc-card hc-stack">
          <h3 className="hc-h3">{f.headline}</h3>
          <p>{f.summary}</p>
          <KV label="Mood heading into 2026-27">{x.sentiment}</KV>
          <KV label="The gameday look">{x.gamedayLook}</KV>
        </div>
        <div className="hc-card-invert">
          <div className="hc-eyebrow">Rivalries</div>
          <ul className="hc-list" style={{ marginTop: 8 }}>{x.rivalries.map((r, i) => <li key={i}><div className="hc-row"><b>{r.opponent}</b><Chip tone={heat[r.heat]}>{r.heat}</Chip></div><div className="hc-small hc-muted" style={{ marginTop: 4 }}>{r.why}</div></li>)}</ul>
        </div>
      </div>
      <h3 className="hc-h2" style={{ marginTop: 28, marginBottom: 14 }}>Fan segments</h3>
      <div className="hc-grid hc-grid-3">
        {x.segments.map((sg, i) => (
          <div key={i} className="hc-card hc-stack">
            <div className="hc-row" style={{ justifyContent: "space-between" }}><h4 className="hc-h3">{sg.name}</h4><Chip tone="line">{sg.share}</Chip></div>
            <p className="hc-small">{sg.description}</p>
            <KV label="Wears">{sg.wears}</KV>
            <KV label="Reach them">{sg.reach}</KV>
          </div>
        ))}
      </div>
      <div className="hc-grid hc-grid-2" style={{ marginTop: "var(--grid-gap)" }}>
        <div className="hc-card"><div className="hc-kv-label">Traditions & rituals</div><ul className="hc-list">{x.traditions.map((t, i) => <li key={i}><b>{t.name}</b><div className="hc-small hc-muted">{t.detail}</div></li>)}</ul></div>
        <div className="hc-card"><div className="hc-kv-label">Icons</div><ul className="hc-list">{x.icons.map((t, i) => <li key={i}><b>{t.name}</b> <span className="hc-muted hc-small">· {t.era}</span><div className="hc-small hc-muted">{t.why}</div></li>)}</ul></div>
      </div>
      <div style={{ marginTop: "var(--grid-gap)" }}><LensView dossier={f} compact /></div>
    </>
  );
}

function Retail({ land, beh }) {
  const lx = land.extra, bx = beh.extra;
  const impact = { high: "pop", medium: undefined, low: "line" };
  return (
    <>
      <div className="hc-grid hc-grid-2" style={{ marginTop: "var(--grid-gap)" }}>
        <div className="hc-card hc-stack">
          <div className="hc-eyebrow">Where they shop</div>
          <h3 className="hc-h3">{land.headline}</h3>
          <ul className="hc-list">{lx.districts.map((x, i) => <li key={i}><div className="hc-row" style={{ justifyContent: "space-between" }}><b>{x.name}</b><Chip tone="line">{x.role}</Chip></div><div className="hc-small" style={{ marginTop: 4 }}>{x.profile}</div><div className="hc-small hc-muted">Shopper: {x.shopper}</div></li>)}</ul>
        </div>
        <div className="hc-card hc-stack">
          <div className="hc-eyebrow">Doors that matter</div>
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
          <KV label="Price profile">{bx.priceProfile}</KV>
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

function Review({ data, ver }) {
  const fc = data.review && data.review.factcheck;
  const cr = data.review && data.review.critique;
  const [open, setOpen] = useState(false);
  const [qOpen, setQOpen] = useState(false);
  const counts = fc ? ["confirmed", "corrected", "removed", "unverifiable"].map((k) => [k, fc.verdicts.filter((v) => v.verdict === k).length]) : [];
  const allSources = LENS_AGENTS.map((a) => ({ a, d: data.dossiers[a.id] }));
  return (
    <>
      <div className="hc-grid hc-grid-2">
        <div className="hc-card hc-stack">
          <div className="hc-eyebrow">Fact-Check Critic</div>
          {fc ? (
            <>
              <div className="hc-row">{counts.map(([k, n]) => <Chip key={k} tone={k === "confirmed" ? "ink" : k === "removed" ? "pop" : "line"}>{n} {k}</Chip>)}</div>
              <p className="hc-small">{fc.summary}</p>
              <button className="hc-pill-btn hc-no-print" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Show"} all {fc.verdicts.length} checks</button>
              {open && <ul className="hc-list">{fc.verdicts.map((v, i) => <li key={i}><div className="hc-row"><Chip tone={v.verdict === "confirmed" ? "ink" : "line"}>{v.verdict}</Chip><span className="hc-small hc-muted">{AGENT_BY_ID[v.lens]?.name || v.lens}</span></div><div className="hc-small" style={{ marginTop: 4 }}>{v.claim}</div><div className="hc-small hc-muted">{v.note}{v.source ? <> · <a href={v.source} target="_blank" rel="noreferrer">source</a></> : null}</div></li>)}</ul>}
            </>
          ) : <p className="hc-muted">No fact-check log for this run.</p>}
        </div>
        <div className="hc-card hc-stack">
          <div className="hc-eyebrow">Authenticity Critic</div>
          {cr ? (
            <>
              <p className="hc-small">{cr.summary}</p>
              <div className="hc-row">{["high", "medium", "low"].map((sv) => <Chip key={sv} tone="line">{cr.issues.filter((x) => x.severity === sv).length} {sv}</Chip>)}</div>
              <ul className="hc-list">{cr.issues.slice(0, 8).map((x, i) => <li key={i}><div className="hc-row"><Chip tone={x.severity === "high" ? "pop" : "line"}>{x.type}</Chip><span className="hc-small hc-muted">{x.target}</span></div><div className="hc-small" style={{ marginTop: 4 }}>{x.problem}</div><div className="hc-small hc-muted">Fix applied by editor: {x.fix}</div></li>)}</ul>
            </>
          ) : <p className="hc-muted">No critique for this run.</p>}
        </div>
      </div>
      {ver.queue.length > 0 && (
        <div className="hc-card-invert" style={{ marginTop: "var(--grid-gap)" }}>
          <div className="hc-row" style={{ justifyContent: "space-between" }}>
            <div><div className="hc-eyebrow">Verification queue</div><h3 className="hc-h3" style={{ marginTop: 4 }}>{ver.queue.length} claims to confirm live before acting</h3></div>
            <button className="hc-pill-btn hc-no-print" onClick={() => setQOpen(!qOpen)} aria-expanded={qOpen}>{qOpen ? "Hide" : "Show"} queue</button>
          </div>
          {qOpen && <ul className="hc-list" style={{ marginTop: 10 }}>{ver.queue.map((q, i) => <li key={i}><span className="hc-small hc-muted">{AGENT_BY_ID[q.lens]?.name || "Brief"} · </span>{q.claim}{q.note ? <div className="hc-small hc-muted">{q.note}</div> : null}</li>)}</ul>}
        </div>
      )}
      <div className="hc-card" style={{ marginTop: "var(--grid-gap)" }}>
        <div className="hc-kv-label">Sources by agent</div>
        <div className="hc-grid hc-grid-3" style={{ marginTop: 10 }}>
          {allSources.map(({ a, d }) => d && (
            <div key={a.id}>
              <div className="hc-row" style={{ marginBottom: 6 }}><b className="hc-small">{a.name}</b><Provenance of={d} /><Confidence level={d.confidence} /></div>
              <ul className="hc-bullets hc-tiny">{d.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
