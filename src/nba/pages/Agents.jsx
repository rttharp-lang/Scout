// The agent system: who the agents are, how the workflow fits together, and a
// console to run the whole workflow live for any market.
import React, { useRef, useState } from "react";
import { LENS_AGENTS, SYNTHESIS_AGENTS, AGENT_BY_ID, STANDARDS } from "../agents/roster.js";
import { TEAMS, TEAM_BY_ID, teamLabel } from "../teams.js";
import { publishedCount } from "../data.js";
import { runMarket } from "../live.js";
import { Chip, SectionHead, href } from "../ui.jsx";

// The cross-market pass (scripts/nba/workflows/home-court-league.js and
// home-court-strengthen.js), run after every market has a brief.
const LEAGUE_STAGE = [
  ["1 · Audit, six at once", "Division auditors", "One per division. Each checks every market file against the league calendar and League Pulse, both checked live. It fixes dates and facts that have drifted, and makes sure every partner a brief names turns up in its dossiers."],
  ["2 · Pull it together", "League Strategist", "Reads all 30 briefs and writes the league read: themes, fan types, big dates, the top opportunities and the Portland playbook. It also puts every market on one scale, with 50 as league average."],
  ["3 · Critique", "Completeness Critic", "Goes after the league read for scores that don't line up, generic themes, wrong dates and missing markets. Then it names the weakest briefs."],
  ["4 · Edit and strengthen", "League Editor and strategists", "The editor fixes every serious and moderate issue. The weakest briefs go back to their strategists, and a reviewer checks each rewrite."],
];

const GROUPS = ["Culture", "Basketball", "Fandom", "Retail"];

export default function Agents({ preselect }) {
  const [team, setTeam] = useState(preselect && TEAM_BY_ID[preselect] ? preselect : "por");
  const [state, setState] = useState({});
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState(null);
  const ctrl = useRef(null);

  const start = async () => {
    setState({});
    setMessage(null);
    setRunning(true);
    ctrl.current = new AbortController();
    try {
      await runMarket(team, (id, patch) => setState((s) => ({ ...s, [id]: { ...s[id], ...patch } })), { signal: ctrl.current.signal });
      setMessage({ ok: true, text: "Done. The run is saved in this browser." });
    } catch (e) {
      const text = e.status === 503
        ? "Live runs aren't set up on this server yet. It needs an ANTHROPIC_API_KEY. The published research is unaffected."
        : e.name === "AbortError" ? "Run stopped." : `Run stopped: ${e.message}`;
      setMessage({ ok: false, text });
    } finally {
      setRunning(false);
    }
  };
  const stop = () => ctrl.current && ctrl.current.abort();

  const tile = (a) => {
    const st = state[a.id];
    return (
      <div key={a.id} className="hc-agent-tile" title={a.mission}>
        <span className="hc-status" data-s={st ? st.status : "idle"} />
        <span style={{ flex: 1 }}>{a.name}</span>
        {st && st.status === "running" && <span className="hc-tiny hc-muted">{st.stage}</span>}
        {st && st.status === "done" && <span className="hc-tiny hc-muted">{Math.round(st.ms / 1000)}s</span>}
        {st && st.status === "failed" && <span className="hc-tiny" style={{ color: "var(--bad)" }}>failed</span>}
      </div>
    );
  };

  return (
    <div>
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>How it's made</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>Fifteen agents<br />per market</h1>
      <p className="hc-lede" style={{ marginTop: 18 }}>
        Eleven specialist agents each research one slice of a market on the live web and write a dossier. A strategist turns the dossiers into a brief for Nike Basketball. Then two critics go after it. One fact-checks the dossiers and fixes them in place. The other hunts for advice that's generic, stereotyped or unfounded. An editor settles every issue. {publishedCount} of 30 markets are published.
      </p>
      <p className="hc-small hc-muted" style={{ marginTop: 12, maxWidth: "70ch" }}>
        Every dossier carries one of two labels. <b style={{ color: "var(--text)" }}>Checked live</b> means it was researched and checked on the web. <b style={{ color: "var(--text)" }}>Knowledge draft</b> means the agents wrote it from their own knowledge, current to mid-2026, because live search wasn't available. Its dated claims wait on a "still to check" list on the market page until a live run confirms them.
      </p>

      {/* Pipeline */}
      <section className="hc-section">
        <SectionHead eyebrow="Step by step" title="How a market gets made" />
        <div className="hc-card">
          <div className="hc-pipeline">
            <div>
              <div className="hc-kv-label">1 · Research, all at once</div>
              <div className="hc-grid hc-grid-2" style={{ gap: 8 }}>{LENS_AGENTS.map(tile)}</div>
            </div>
            <div className="hc-pipe-arrow" aria-hidden="true">→</div>
            <div>
              <div className="hc-kv-label">2 · Write the brief</div>
              {tile(AGENT_BY_ID.strategist)}
            </div>
            <div className="hc-pipe-arrow" aria-hidden="true">→</div>
            <div>
              <div className="hc-kv-label">3 · Check, both at once</div>
              <div style={{ display: "grid", gap: 8 }}>{tile(AGENT_BY_ID.factcheck)}{tile(AGENT_BY_ID.authenticity)}</div>
            </div>
            <div className="hc-pipe-arrow" aria-hidden="true">→</div>
            <div>
              <div className="hc-kv-label">4 · Edit</div>
              {tile(AGENT_BY_ID.editor)}
            </div>
          </div>

          <hr className="hc-divider" />
          <div className="hc-row hc-no-print" style={{ gap: 10 }}>
            <label className="hc-small" htmlFor="hc-run-team" style={{ fontWeight: 600 }}>Run live for</label>
            <select id="hc-run-team" className="hc-select" value={team} onChange={(e) => setTeam(e.target.value)} disabled={running}>
              {TEAMS.map((t) => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
            </select>
            {!running ? <button className="hc-btn" onClick={start}>Run all 15 agents</button> : <button className="hc-btn hc-btn-ghost" onClick={stop}>Stop</button>}
            {message && message.ok && <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("m", team)}>See the live brief →</a>}
          </div>
          {message && <p className="hc-small" role="status" style={{ marginTop: 10, color: message.ok ? "var(--good)" : "var(--text)" }}>{message.text}</p>}
          <p className="hc-tiny hc-muted" style={{ marginTop: 8 }}>Live runs use the Claude API with web search and take a few minutes. They're saved only in this browser, and the published research stays as it is.</p>
        </div>
      </section>

      {/* League stage */}
      <section className="hc-section">
        <SectionHead eyebrow="Once all 30 markets are in" title="The league read">
          <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("league")}>Go to the league read →</a>
        </SectionHead>
        <div className="hc-grid hc-grid-4">
          {LEAGUE_STAGE.map(([step, name, what]) => (
            <div key={step} className="hc-card hc-stack">
              <div className="hc-kv-label">{step}</div>
              <h3 className="hc-h3">{name}</h3>
              <p className="hc-small hc-muted">{what}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roster */}
      <section className="hc-section">
        <SectionHead eyebrow="Research agents" title="The roster" />
        {GROUPS.map((g) => (
          <div key={g} style={{ marginBottom: 28 }}>
            <h3 className="hc-h2" style={{ marginBottom: 12 }}>{g}</h3>
            <div className="hc-grid hc-grid-3">
              {LENS_AGENTS.filter((a) => a.group === g).map((a) => <AgentCard key={a.id} a={a} />)}
            </div>
          </div>
        ))}
        <h3 className="hc-h2" style={{ marginBottom: 12 }}>Writing and checking</h3>
        <div className="hc-grid hc-grid-4">
          {SYNTHESIS_AGENTS.map((a) => (
            <div key={a.id} className="hc-card-invert hc-stack">
              <Chip>{a.group}</Chip>
              <h4 className="hc-h3">{a.name}</h4>
              <p className="hc-small hc-muted">{a.mission}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hc-section">
        <SectionHead eyebrow="The rules every agent follows" title="The standard" />
        <div className="hc-card">
          <ul className="hc-list">
            {STANDARDS.split("\n").filter((l) => l.startsWith("- ")).map((l, i) => {
              const [head, ...rest] = l.slice(2).split(":");
              return <li key={i}><b>{head}</b>{rest.length ? `: ${rest.join(":")}` : ""}</li>;
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}

function AgentCard({ a }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="hc-card hc-stack">
      <h4 className="hc-h3">{a.name}</h4>
      <p className="hc-small">{a.mission}</p>
      <button className="hc-pill-btn" style={{ alignSelf: "flex-start" }} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "What it asks"}</button>
      {open && <ul className="hc-bullets hc-small">{a.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}
    </article>
  );
}
