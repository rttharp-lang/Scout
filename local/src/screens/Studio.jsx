import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fmtDate, fmtTime } from "../lib/api.js";
import { useApp, useWorkspace, useFetch } from "../lib/store.jsx";
import { Label, Empty, Drawer } from "../components/ui.jsx";

const ACTIVE = ["queued", "researching", "challenging", "following_up", "synthesizing"];

export default function StudioPanel({ teamId: fixedTeam, embedded, onChanged }) {
  const { wid } = useParams(); const { teams, llm } = useApp(); const ws = useWorkspace(wid); const editor = ["editor", "admin"].includes(ws?.role);
  const [teamId, setTeamId] = useState(fixedTeam || ""); const [question, setQuestion] = useState(""); const [depth, setDepth] = useState("standard");
  const [budget, setBudget] = useState({ max_usd: 3, max_tasks: 14, max_sources: 60, max_wall_seconds: 900 });
  const [scope, setScope] = useState({ season: "", window: "", product_season: "" });
  const { data: runs, reload } = useFetch(`/workspaces/${wid}/runs${fixedTeam ? `?team_id=${fixedTeam}` : ""}`, [wid, fixedTeam]);
  const { data: connectors } = useFetch(`/connectors`, []);
  const { data: specialists } = useFetch(`/specialists`, []);
  const [open, setOpen] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!runs?.some((r) => ACTIVE.includes(r.state))) return; const t = setInterval(reload, 2500); return () => clearInterval(t); }, [runs]);
  const launch = async () => { if (!teamId || !question.trim()) return; setBusy(true); try { const r = await api.post(`/workspaces/${wid}/runs`, { team_id: teamId, question, scope: { depth, ...scope }, budget }); setQuestion(""); reload(); setOpen(r.id); } finally { setBusy(false); } };
  const cancel = async (id) => { await api.post(`/workspaces/${wid}/runs/${id}/cancel`); reload(); };
  const live = ws?.kind !== "demo";
  return (
    <div>
      <div className="eyebrow">Research Studio</div>
      <h2 className="section">{fixedTeam ? "Research this team" : "Ask a question, launch a run"}</h2>
      <p className="lede">A run executes real backend tasks: intake → plan → discover → fan out → consolidate → challenge → re-route → synthesize → review. Results persist across sessions. Budgets bound recursion, sources, wall time and spend.</p>
      <div className="grid cols-2" style={{ marginTop: 20 }}>
        <div className="card stack">
          {!editor && <div className="notice">Viewers can inspect runs; launching requires the editor role.</div>}
          {!live && <div className="notice">This is the demo workspace. Runs launched here execute for real but only reach whatever sources this host can access; switch to the live workspace for research.</div>}
          {!llm?.configured && <div className="notice">Model provider not configured (ANTHROPIC_API_KEY). Runs will gather and store reachable sources for human coding but produce no agent findings, review or synthesis. Connector states are shown on the right.</div>}
          {!fixedTeam && <div><label className="field">Team</label><select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}><option value="">Select team…</option>{teams.filter((t) => t.status === "active").map((t) => <option key={t.id} value={t.id}>{t.league_id.toUpperCase()} · {t.name}</option>)}</select></div>}
          <div><label className="field">Research question (the decision this should inform)</label><textarea className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Which fan-created rituals are durable enough to anchor a 2027-28 uniform story, and what would grow repeat attendance among first-time families?" /></div>
          <div className="grid cols-3"><div><label className="field">Depth</label><select className="input" value={depth} onChange={(e) => setDepth(e.target.value)}><option value="quick">Quick (core 4)</option><option value="standard">Standard</option><option value="deep">Deep (full roster)</option></select></div><div><label className="field">Competition season</label><input className="input" value={scope.season} onChange={(e) => setScope({ ...scope, season: e.target.value })} placeholder="2026-27" /></div><div><label className="field">Target product season</label><input className="input" value={scope.product_season} onChange={(e) => setScope({ ...scope, product_season: e.target.value })} placeholder="2027-28" /></div></div>
          <div className="grid cols-4">{[["max_usd", "Max spend (USD)"], ["max_tasks", "Max research tasks"], ["max_sources", "Max sources"], ["max_wall_seconds", "Max seconds"]].map(([k, l]) => <div key={k}><label className="field">{l}</label><input className="input" type="number" value={budget[k]} onChange={(e) => setBudget({ ...budget, [k]: Number(e.target.value) })} /></div>)}</div>
          <button className="btn team" disabled={!editor || busy || !teamId || !question.trim()} onClick={launch}>{busy ? "Launching…" : "Launch research run"}</button>
        </div>
        <div className="card">
          <div className="eyebrow">Connectors (verified states)</div>
          <ul className="list-plain">{(connectors || []).map((c) => <li key={c.id}><div className="row"><Label kind={c.state} /><b>{c.name}</b></div><div className="small">{c.detail}</div></li>)}</ul>
          <p className="small">Never displayed as connected unless a live check succeeded. Fallbacks: open-web evidence where reachable and uploaded research (Evidence → Upload).</p>
        </div>
      </div>
      <h3 className="headline" style={{ marginTop: 30 }}>Runs</h3>
      {runs?.length ? <table className="data" style={{ marginTop: 8 }}><thead><tr><th>Question</th>{!fixedTeam && <th>Team</th>}<th>State</th><th>Tasks</th><th>Sources</th><th>Spend</th><th>Elapsed</th><th>Started</th><th></th></tr></thead><tbody>{runs.map((r) => <tr key={r.id}><td><a href="#" onClick={(e) => { e.preventDefault(); setOpen(r.id); }}>{r.question}</a>{r.parent_run_id && <span className="small"> · follow-up</span>}{r.scope?.demo && <span className="chip demo" style={{ marginLeft: 6 }}>fixture</span>}</td>{!fixedTeam && <td><Link to={`/w/${wid}/teams/${r.team_id}`}>{teams.find((t) => t.id === r.team_id)?.name || r.team_id}</Link></td>}<td><span className={`chip state`}>{r.state.replace(/_/g, " ")}</span></td><td>{r.spent?.tasks ?? 0}</td><td>{r.spent?.sources ?? 0}</td><td>${(r.spent?.usd ?? 0).toFixed(2)}</td><td>{r.started_at ? `${Math.round((Date.parse(r.finished_at || Date.now()) - Date.parse(r.started_at)) / 1000)}s` : "—"}</td><td className="small">{fmtTime(r.created_at)}</td><td>{ACTIVE.includes(r.state) && editor && <button className="btn ghost sm" onClick={() => cancel(r.id)}>Cancel</button>}</td></tr>)}</tbody></table> : <Empty>No runs yet.</Empty>}
      <RunDrawer id={open} onClose={() => { setOpen(null); reload(); onChanged?.(); }} wid={wid} editor={editor} specialists={specialists || []} />
    </div>
  );
}

function RunDrawer({ id, onClose, wid, editor, specialists }) {
  const [r, setR] = useState(null); const [task, setTask] = useState(null); const [fu, setFu] = useState({ specialist: "", question: "" });
  const load = () => id && api.get(`/workspaces/${wid}/runs/${id}`).then(setR);
  useEffect(() => { setR(null); setTask(null); load(); }, [id]);
  useEffect(() => { if (!r || !ACTIVE.includes(r.state)) return; const t = setInterval(load, 2000); return () => clearInterval(t); }, [r?.state, id]);
  const openTask = async (t) => setTask(await api.get(`/workspaces/${wid}/runs/${id}/tasks/${t.id}`));
  const followup = async () => { if (!fu.specialist || !fu.question) return; await api.post(`/workspaces/${wid}/runs/${id}/followup`, fu); alert("Follow-up run queued."); setFu({ specialist: "", question: "" }); };
  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={r ? `Run · ${r.state.replace(/_/g, " ")}` : "Run"} width="min(860px,100%)">
      {r && <div className="stack">
        <p className="lede" style={{ fontSize: 16 }}>{r.question}</p>
        <div className="row small"><span className="pill">tasks {r.spent?.tasks}/{r.budget?.max_tasks}</span><span className="pill">sources {r.spent?.sources}/{r.budget?.max_sources}</span><span className="pill">spend ${(r.spent?.usd || 0).toFixed(2)}/${r.budget?.max_usd}</span><span className="pill">elapsed {r.elapsed_seconds}s/{r.budget?.max_wall_seconds}s</span><span className="pill">model {r.model_info?.configured ? r.model_info.model : "not configured"}</span>{r.model_info?.prompt_version && <span className="pill">prompt {r.model_info.prompt_version}</span>}</div>
        {r.summary?.note && <div className="notice">{r.summary.note}</div>}
        {r.summary?.coverage_gaps?.length > 0 && <div className="notice bad"><b>Coverage gaps:</b><ul style={{ margin: "4px 0 0 18px" }}>{r.summary.coverage_gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
        {r.plan?.specialists && <div><div className="eyebrow">Plan</div><div className="small">Specialists: {r.plan.specialists.join(", ")}{r.plan.skipped?.length ? ` · skipped: ${r.plan.skipped.map((s) => `${s.specialist} (${s.reason})`).join("; ")}` : ""}</div>{r.plan.competing_hypotheses && <details><summary className="small">Competing hypotheses and disconfirmers</summary><ul className="small">{r.plan.competing_hypotheses.map((h, i) => <li key={i}><b>{h.motivation}</b>: {h.hypothesis} <i>Disconfirm: {h.disconfirm}</i></li>)}{(r.plan.growth_hypotheses || []).map((h, i) => <li key={`g${i}`}><b>{h.stage}</b>: {h.hypothesis} <i>Disconfirm: {h.disconfirm}</i></li>)}</ul></details>}</div>}
        <div><div className="eyebrow">Tasks</div><ul className="list-plain tasklist">{r.tasks.map((t) => <li key={t.id}><span><b>{t.specialist}</b><div className="small">{t.phase}</div></span><span className={`chip state`}>{t.state.replace(/_/g, " ")}</span><span className="small">tools: {(t.tools_used || []).join(", ") || "—"} · sources {t.sources_found} · {t.unresolved?.length || 0} unresolved{t.cost?.usd ? ` · $${t.cost.usd.toFixed(3)}` : ""}{t.error ? ` · ${t.error}` : ""} <a href="#" onClick={(e) => { e.preventDefault(); openTask(t); }}>details</a></span></li>)}</ul></div>
        {r.summary?.unresolved_questions?.length > 0 && <div><div className="eyebrow">Unresolved questions</div><ul className="small">{r.summary.unresolved_questions.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
        {r.summary?.residual_uncertainty && <p className="small">Residual uncertainty: {r.summary.residual_uncertainty}</p>}
        {editor && <div className="card"><div className="eyebrow">Request a targeted follow-up</div><div className="row" style={{ marginTop: 8 }}><select className="input" style={{ maxWidth: 260 }} value={fu.specialist} onChange={(e) => setFu({ ...fu, specialist: e.target.value })}><option value="">Specialist…</option>{specialists.filter((s) => s.kind === "research").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><input className="input" value={fu.question} onChange={(e) => setFu({ ...fu, question: e.target.value })} placeholder="Focused question" /><button className="btn sm" onClick={followup}>Queue</button></div></div>}
        <p className="small">Task summaries show tools used, sources found and unresolved questions. Private chain-of-thought is never exposed.</p>
        <Drawer open={Boolean(task)} onClose={() => setTask(null)} title={task ? `${task.specialist} · ${task.state}` : ""}>{task && <div className="stack"><div className="small">Attempt {task.attempt} · started {fmtTime(task.started_at)} · finished {fmtTime(task.finished_at)}</div>{task.error && <div className="notice bad">{task.error}</div>}<pre className="mono" style={{ whiteSpace: "pre-wrap", background: "#fff", padding: 12, border: "1px solid var(--line)", borderRadius: 4, maxHeight: 480, overflow: "auto" }}>{JSON.stringify(task.output, null, 2)}</pre></div>}</Drawer>
      </div>}
    </Drawer>
  );
}
