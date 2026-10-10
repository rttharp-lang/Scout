// The agent system: who the agents are and how the workflow fits together.
// The agents run offline in the research workflow; nothing on the site runs
// them or calls a paid API.
import React, { useState } from "react";
import { LENS_AGENTS, SYNTHESIS_AGENTS, AGENT_BY_ID, STANDARDS } from "../agents/roster.js";
import { publishedCount } from "../data.js";
import { Chip, SectionHead, href } from "../ui.jsx";
import Method from "./Method.jsx";

// The cross-market pass (scripts/nba/workflows/home-court-league.js and
// home-court-strengthen.js), run after every market has a brief.
const LEAGUE_STAGE = [
  ["1 · Audit, six at once", "Division auditors", "One per division. Each checks every market file against the league calendar and League Pulse, both checked live. It fixes dates and facts that have drifted, and makes sure every partner a brief names turns up in its dossiers."],
  ["2 · Pull it together", "League Strategist", "Reads all 30 briefs and writes the league read: themes, fan types, big dates, the top opportunities and the Portland playbook. It also puts every market on one scale, with 50 as league average."],
  ["3 · Critique", "Completeness Critic", "Goes after the league read for scores that don't line up, generic themes, wrong dates and missing markets. Then it names the weakest briefs."],
  ["4 · Edit and strengthen", "League Editor and strategists", "The editor fixes every serious and moderate issue. The weakest briefs go back to their strategists, and a reviewer checks each rewrite."],
];

const GROUPS = ["Culture", "Basketball", "Fandom", "Retail"];

export default function Agents({ methodAnchor }) {
  const tile = (a) => (
    <div key={a.id} className="hc-agent-tile" title={a.mission}>
      <span className="hc-status" data-s="idle" />
      <span style={{ flex: 1 }}>{a.name}</span>
    </div>
  );

  return (
    <div>
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>How it's made</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>Fifteen agents<br />per market</h1>
      <p className="hc-lede" style={{ marginTop: 18 }}>
        Eleven specialist agents each research one slice of a market and write a dossier. A strategist turns the dossiers into a brief. Two critics go after it: one fact-checks the riskiest claims, the other hunts for advice that's generic, stereotyped or unfounded. An editor settles the issues. {publishedCount} of 30 markets are published.
      </p>
      <p className="hc-small hc-muted" style={{ marginTop: 12, maxWidth: "70ch" }}>
        For this edition, live search was unavailable for most of the work, so all but three dossiers are <b style={{ color: "var(--text)" }}>desk research</b>: written from the agents' own knowledge, current to mid-2026, and unverified. The fact-check agents mostly worked the same way, so their verdicts don't count as verification. A separate review pass checked the riskiest claims live. <a href={href("method")}>The Method page</a> explains what was checked and what every label means.
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

        </div>
      </section>

      {/* League stage */}
      <section className="hc-section">
        <SectionHead eyebrow="Once all 30 markets are in" title="The league read">
          <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("league")}>See the league read →</a>
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

      <Method anchor={methodAnchor} />
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
