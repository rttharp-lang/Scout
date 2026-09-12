import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useApp, useFetch, useWorkspace } from "../lib/store.jsx";
import { api, fmtDate, teamStyle } from "../lib/api.js";
import { Hero, TeamNav } from "../components/Hero.jsx";
import { StoryGrid, ClaimDrawer } from "../components/Stories.jsx";
import { SeasonRhythm } from "../components/SeasonRhythm.jsx";
import { Label, Confidence, Empty, Loading, ErrorBox, Drawer, Demo } from "../components/ui.jsx";
import UniformLab from "./sections/UniformLab.jsx";
import Growth from "./sections/Growth.jsx";
import Identity from "./sections/Identity.jsx";
import StudioPanel from "./Studio.jsx";
import EvidenceLibrary from "./EvidenceLibrary.jsx";
import Ask from "./Ask.jsx";

export default function TeamWorld() {
  const { wid, teamId, section = "" } = useParams(); const ws = useWorkspace(wid); const { user } = useApp();
  const { data: d, error, loading, reload } = useFetch(`/workspaces/${wid}/teams/${teamId}/dossier`, [wid, teamId]);
  const [params, setParams] = useSearchParams();
  const openClaim = params.get("claim");
  const setClaim = (id) => { const p = new URLSearchParams(params); id ? p.set("claim", id) : p.delete("claim"); setParams(p, { replace: true }); };
  useEffect(() => { window.scrollTo({ top: section ? Math.min(window.scrollY, 0) : 0 }); }, [teamId]);
  if (loading && !d) return <Loading />; if (error) return <ErrorBox error={error} />;
  const team = d.team; const editor = ["editor", "admin"].includes(ws?.role);
  const saved = (d.state?.saved_by || []).includes(user?.id);
  const bySection = (s) => d.claims.filter((c) => c.section === s);
  const changes = d.notifications.filter((n) => n.status === "unread");
  const toggleSave = async () => { await api.post(`/workspaces/${wid}/teams/${teamId}/save`); reload(); };
  const markReviewed = async () => { await api.post(`/workspaces/${wid}/teams/${teamId}/reviewed`); reload(); };
  return (
    <main style={teamStyle(team)}>
      {!section && <Hero team={team} dossier={d} onOpenClaim={setClaim} />}
      {section && <div className="wrap" style={{ paddingTop: 18 }}><div className="eyebrow">{team.league_id.toUpperCase()} · {team.market}</div><h1 className="display" style={{ fontSize: "clamp(40px, 7vw, 96px)", color: "var(--team)" }}>{team.nickname}</h1></div>}
      <TeamNav wid={wid} teamId={teamId} />
      <div className="peek" />
      <div className="wrap" style={{ paddingTop: 14 }}>
        <div className="row small">
          <button className="btn ghost sm" onClick={toggleSave}>{saved ? "★ Saved" : "☆ Save team"}</button>
          {editor && <button className="btn ghost sm" onClick={markReviewed}>Mark reviewed</button>}
          <span>Owner: {d.state?.owner_user_id ? "assigned" : "unassigned"} · Last reviewed {d.state?.last_reviewed_at ? fmtDate(d.state.last_reviewed_at) : "never"} · Evidence: {d.evidence_summary.total} items from {d.evidence_summary.families} independent source families ({d.evidence_summary.sources} sources)</span>
          {team.registry?.verification?.status === "needs_verification" && <span className="chip" style={{ color: "var(--warn)" }} title={team.registry.verification.note}>registry check pending</span>}
          <span className="spacer" />
          <Link className="btn ghost sm" to={`/w/${wid}/teams/${teamId}/studio`}>Research this team</Link>
        </div>
      </div>
      {!section && <Overview d={d} wid={wid} open={setClaim} changes={changes} />}
      {section === "identity" && <Identity d={d} open={setClaim} reload={reload} />}
      {section === "communities" && <Communities d={d} open={setClaim} />}
      {section === "culture" && <Culture d={d} open={setClaim} />}
      {section === "season" && <Season d={d} wid={wid} teamId={teamId} />}
      {section === "growth" && <Growth d={d} open={setClaim} reload={reload} />}
      {section === "uniform" && <UniformLab d={d} open={setClaim} reload={reload} />}
      {section === "studio" && <section className="wrap block"><StudioPanel teamId={teamId} embedded onChanged={reload} /></section>}
      {section === "evidence" && <section className="wrap block"><EvidenceLibrary teamId={teamId} embedded /></section>}
      {section === "ask" && <section className="wrap block"><Ask teamId={teamId} team={team} openClaim={setClaim} /></section>}
      <ClaimDrawer claimId={openClaim} onClose={() => setClaim(null)} onChanged={reload} />
    </main>
  );
}

function Overview({ d, wid, open, changes }) {
  const top = [...d.claims].sort((a, b) => (b.prominence || 0) - (a.prominence || 0)).slice(0, 7);
  const latestDossier = d.dossiers?.[0];
  const missing = d.communities.map((c) => c.data.missing_voices).filter(Boolean);
  return (<>
    <section className="wrap block" style={{ borderTop: 0 }}>
      <div className="row between"><div><div className="eyebrow">Overview</div><h2 className="section">What the research shows</h2></div><div className="small" style={{ maxWidth: 420 }}>{d.workspace.kind === "demo" ? "Synthetic fixtures for demonstration. Every story links to its (synthetic) evidence." : "Stories are sized by significance. Every one links to evidence, contradictions and uncertainty."}</div></div>
      <div style={{ marginTop: 20 }}><StoryGrid claims={top} onOpen={open} emptyText="No findings yet. Launch a research run to populate this team." /></div>
    </section>
    <section className="wrap block">
      <div className="grid cols-3">
        <div className="card"><div className="eyebrow">What changed</div>{changes.length ? changes.map((n) => <ul key={n.id} className="small" style={{ paddingLeft: 18 }}>{(n.data.items || [n.title]).map((i, k) => <li key={k}>{i}</li>)}</ul>) : <p className="small">Nothing new since the last review.</p>}</div>
        <div className="card"><div className="eyebrow">What remains uncertain</div>{latestDossier?.data?.uncertainty ? <p className="small">{latestDossier.data.uncertainty}</p> : <ul className="small" style={{ paddingLeft: 18 }}>{d.claims.filter((c) => c.label === "hypothesis" || c.contradictions > 0).slice(0, 5).map((c) => <li key={c.id}><a href="#" onClick={(e) => { e.preventDefault(); open(c.id); }}>{c.headline || c.statement}</a>{c.contradictions > 0 ? " — has contradicting evidence" : " — hypothesis"}</li>)}{d.runs[0]?.summary?.coverage_gaps?.map((g, i) => <li key={`g${i}`}>{g}</li>)}</ul>}</div>
        <div className="card"><div className="eyebrow">Whose voices are missing</div>{missing.length ? <ul className="small" style={{ paddingLeft: 18 }}>{missing.map((m, i) => <li key={i}>{m}</li>)}</ul> : <p className="small">Not yet assessed.</p>}<Link className="small" to={`/w/${wid}/teams/${d.team.id}/communities`}>Communities →</Link></div>
      </div>
    </section>
    <section className="wrap block">
      <div className="row between"><h3 className="headline">Uniform opportunities</h3><Link className="btn ghost sm" to={`/w/${wid}/teams/${d.team.id}/uniform`}>Open Uniform Lab →</Link></div>
      {d.opportunities.length ? <div className="grid cols-3" style={{ marginTop: 14 }}>{d.opportunities.slice(0, 3).map((o) => <Link key={o.id} to={`/w/${wid}/teams/${d.team.id}/uniform?open=${o.id}`} className="card" style={{ textDecoration: "none" }}><div className="row"><Label kind="proposal" /><span className="chip state">{o.status.replace(/_/g, " ")}</span><span className="chip state">{o.data.durability}</span></div><h3 style={{ marginTop: 8, fontSize: 24 }}>{o.title}</h3><p className="small">{o.data.proposition}</p></Link>)}</div> : <Empty>No territories yet. Territories are produced only after reviewed research; none are forced.</Empty>}
    </section>
  </>);
}

function Communities({ d, open }) {
  const [sel, setSel] = useState(null);
  return (<>
    <section className="wrap block" style={{ borderTop: 0 }}>
      <div className="eyebrow">Communities</div><h2 className="section">Who the fans are, where they gather</h2>
      {d.communities.length ? <div className="grid cols-2" style={{ marginTop: 20 }}>{d.communities.map((c) => <button key={c.id} className="card" style={{ textAlign: "left" }} onClick={() => setSel(c)}><div className="row"><span className="chip state">{c.data.relationship}</span><Demo on={c.data.demo} /></div><h3 style={{ marginTop: 8, fontSize: 24 }}>{c.title}</h3><p>{c.data.description}</p><div className="small">Gathers: {c.data.gathering} · Entry: {(c.data.entry_routes || []).join(", ")}</div><div className="small" style={{ color: "var(--bad)" }}>Missing: {c.data.missing_voices}</div></button>)}</div> : <Empty>No communities identified yet.</Empty>}
    </section>
    <section className="wrap block"><h3 className="headline">Findings about communities</h3><div style={{ marginTop: 14 }}><StoryGrid claims={d.claims.filter((c) => c.section === "communities")} onOpen={open} /></div></section>
    <Drawer open={Boolean(sel)} onClose={() => setSel(null)} title={sel?.title}>{sel && <div className="stack"><p>{sel.data.description}</p><dl className="kv">{[["Relationship to team", sel.data.relationship], ["Participation pattern", sel.data.participation], ["Gathering places", sel.data.gathering], ["Entry routes", (sel.data.entry_routes || []).join(", ")], ["Missing voices", sel.data.missing_voices], ["Evidence note", sel.data.evidence_note]].map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl><p className="small">Community composition is described only from credible aggregate evidence or self-described group context. No traits are inferred about individuals.</p><div className="eyebrow">Related findings</div><ul>{d.claims.filter((c) => c.data?.community && sel.title.toLowerCase().includes((d.communities.find((x) => x.id === sel.id)?.data?.key || "").toLowerCase())).map((c) => <li key={c.id}><a href="#" onClick={(e) => { e.preventDefault(); open(c.id); }}>{c.headline}</a></li>)}{d.claims.filter((c) => c.data?.community).length === 0 && <li className="small">none linked</li>}</ul></div>}</Drawer>
  </>);
}

function Culture({ d, open }) {
  const culture = d.claims.filter((c) => ["culture", "identity", "uniform"].includes(c.section));
  const places = d.claims.filter((c) => (c.codes || []).some((k) => k.node_id.startsWith("ctx.place")));
  const rituals = d.claims.filter((c) => (c.codes || []).some((k) => k.node_id.startsWith("exp.ritual") || k.node_id.startsWith("exp.language")));
  const visual = d.claims.filter((c) => (c.codes || []).some((k) => k.node_id.startsWith("exp.visual") || k.node_id.startsWith("exp.object")));
  const tensions = d.claims.filter((c) => (c.codes || []).some((k) => k.node_id.startsWith("ctx.tension")));
  const Block = ({ title, items, note }) => <section className="wrap block"><div className="row between"><h3 className="headline">{title}</h3><span className="small">{note}</span></div><div style={{ marginTop: 14 }}><StoryGrid claims={items} onOpen={open} emptyText={`No ${title.toLowerCase()} findings yet.`} /></div></section>;
  return (<>
    <section className="wrap block" style={{ borderTop: 0 }}><div className="eyebrow">Local culture</div><h2 className="section">Places, rituals, codes, histories</h2><p className="lede">What fans create, repeat, wear, defend, reject and pass down without the team telling them to. Team-published messaging is labeled as such.</p></section>
    <Block title="Rituals and language" items={rituals} note="Repetition across occasions is required to call something a ritual." />
    <Block title="Places" items={places} note="Places appear only with demonstrated fan meaning, not city trivia." />
    <Block title="Visual codes and objects" items={visual} note="Evidence of fan use, not designer preference." />
    <Block title="Uniform history and reception" items={d.claims.filter((c) => c.section === "uniform")} note="Identity, execution, price and nostalgia explanations are kept separate." />
    <Block title="Unresolved tensions" items={tensions} note="Disagreements between fan groups are preserved, not averaged." />
    {culture.length === 0 && <section className="wrap block"><Empty>No culture findings yet for this team.</Empty></section>}
  </>);
}

function Season({ d, wid, teamId }) {
  const { data: metrics } = useFetch(`/workspaces/${wid}/teams/${teamId}/metrics`, [wid, teamId]);
  return (<>
    <section className="wrap block" style={{ borderTop: 0 }}>
      <div className="eyebrow">Season rhythm · {d.team.league_id.toUpperCase()} calendar</div><h2 className="section">When fandom intensifies</h2>
      <p className="lede">Six synchronized lanes. Confirmed events, historically recurring windows, predictions and contingent moments are visibly different. Future engagement is never shown as observed data; missing coverage renders as missing.</p>
      <div style={{ marginTop: 18 }}><SeasonRhythm team={d.team} moments={d.moments} milestones={d.milestones} seasons={d.seasons} metrics={metrics || []} claims={d.claims} tz={d.team.tz} /></div>
      <div className="row small" style={{ marginTop: 10 }}><a href={`/api/workspaces/${wid}/teams/${teamId}/export/calendar`} target="_blank" rel="noreferrer">Export moment calendar (JSON)</a><span>·</span><Link to={`/w/${wid}/settings`}>Configure product gates</Link></div>
    </section>
    <section className="wrap block"><h3 className="headline">All moments</h3><table className="data" style={{ marginTop: 10 }}><thead><tr><th>Moment</th><th>Lane</th><th>Date</th><th>Kind</th><th>Recurrence</th><th>Function</th><th>Uncertainty</th></tr></thead><tbody>{d.moments.sort((a, b) => (a.starts_at || "").localeCompare(b.starts_at || "")).map((m) => <tr key={m.id}><td><b>{m.title}</b><div className="small">{m.data.why_local}</div></td><td>{m.data.lane}</td><td>{fmtDate(m.starts_at)}</td><td><span className={`chip ${m.data.date_kind}`}>{m.data.date_kind}</span></td><td>{m.data.recurrence}</td><td>{m.data.emotional_function}</td><td className="small">{m.data.uncertainty}</td></tr>)}</tbody></table></section>
  </>);
}
