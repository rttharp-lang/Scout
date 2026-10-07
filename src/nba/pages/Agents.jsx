// The agent system: who the agents are, how the workflow fits together, and a
// console to run the whole workflow live for any market.
import React, { useRef, useState } from "react";
import { LENS_AGENTS, SYNTHESIS_AGENTS, AGENT_BY_ID, STANDARDS } from "../agents/roster.js";
import { TEAMS, TEAM_BY_ID } from "../teams.js";
import { publishedCount } from "../data.js";
import { runMarket } from "../live.js";
import { Chip, SectionHead, href } from "../ui.jsx";

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
      setMessage({ ok: true, text: "Run complete — saved in this browser." });
    } catch (e) {
      const text = e.status === 503
        ? "Live agents aren't configured on this deployment (the server needs ANTHROPIC_API_KEY). The published research is unaffected."
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
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>The agent system</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>Fifteen agents<br />per market</h1>
      <p className="hc-lede" style={{ marginTop: 18 }}>
        Eleven specialist agents each research one slice of a market on the live web and write a dossier. A strategist turns the dossiers into the Nike Basketball brief, two critics attack it — one fact-checks the dossiers and corrects them in place, one hunts for generic, stereotyped or unfounded recommendations — and an editor resolves every issue. {publishedCount} of 30 markets are published.
      </p>

      {/* Pipeline */}
      <section className="hc-section">
        <SectionHead eyebrow="The workflow" title="How a market gets researched" />
        <div className="hc-card">
          <div className="hc-pipeline">
            <div>
              <div className="hc-kv-label">1 · Research — in parallel</div>
              <div className="hc-grid hc-grid-2" style={{ gap: 8 }}>{LENS_AGENTS.map(tile)}</div>
            </div>
            <div className="hc-pipe-arrow" aria-hidden="true">→</div>
            <div>
              <div className="hc-kv-label">2 · Synthesize</div>
              {tile(AGENT_BY_ID.strategist)}
            </div>
            <div className="hc-pipe-arrow" aria-hidden="true">→</div>
            <div>
              <div className="hc-kv-label">3 · Verify — in parallel</div>
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
              {TEAMS.map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
            </select>
            {!running ? <button className="hc-btn" onClick={start}>Run all 15 agents</button> : <button className="hc-btn hc-btn-ghost" onClick={stop}>Stop</button>}
            {message && message.ok && <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("m", team)}>View the live brief →</a>}
          </div>
          {message && <p className="hc-small" role="status" style={{ marginTop: 10, color: message.ok ? "var(--good)" : "var(--text)" }}>{message.text}</p>}
          <p className="hc-tiny hc-muted" style={{ marginTop: 8 }}>Live runs use the Claude API with web search, take a few minutes, and are saved only in this browser; the published research doesn't change.</p>
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
        <h3 className="hc-h2" style={{ marginBottom: 12 }}>Synthesis & verification</h3>
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
        <SectionHead eyebrow="Every agent is held to" title="The bar" />
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
