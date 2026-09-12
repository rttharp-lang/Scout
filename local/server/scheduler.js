// Recurring research schedules (per team, source set, frequency). Runs inside
// the long-lived backend process; nothing is simulated with frontend timers.
// Each due schedule creates a real research run and records last/next run.
import { q, rows, run, now, uid, J } from "./db.js";
import { createRun } from "./engine/orchestrator.js";

export function createSchedule({ workspace_id, team_id, kind = "refresh", frequency_hours = 168, config = {}, created_by = null }) {
  const id = uid("sch");
  const next = new Date(Date.now() + frequency_hours * 3600e3).toISOString();
  run("INSERT INTO schedules(id,workspace_id,team_id,kind,frequency_hours,config,enabled,last_run_at,next_run_at,created_by,created_at) VALUES(?,?,?,?,?,?,1,NULL,?,?,?)",
    [id, workspace_id, team_id, kind, frequency_hours, J(config), next, created_by, now()]);
  return rows(q("SELECT * FROM schedules WHERE id=?", [id]))[0];
}
export function listSchedules(workspace_id) { return rows(q("SELECT * FROM schedules WHERE workspace_id=? ORDER BY created_at DESC", [workspace_id])); }
export function setScheduleEnabled(id, enabled) { run("UPDATE schedules SET enabled=? WHERE id=?", [enabled ? 1 : 0, id]); }
export function deleteSchedule(id) { run("DELETE FROM schedules WHERE id=?", [id]); }

export function runDue() {
  const due = rows(q("SELECT * FROM schedules WHERE enabled=1 AND next_run_at <= ?", [now()]));
  const started = [];
  for (const s of due) {
    const question = s.config.question || `Scheduled ${s.kind}: refresh changed sources and watchlist for this team.`;
    const r = createRun({ workspace_id: s.workspace_id, team_id: s.team_id, question, scope: { ...(s.config.scope || {}), scheduled: true, schedule_id: s.id }, budget: s.config.budget || { max_tasks: 8, max_usd: 1 }, created_by: s.created_by });
    run("UPDATE schedules SET last_run_at=?, next_run_at=? WHERE id=?", [now(), new Date(Date.now() + s.frequency_hours * 3600e3).toISOString(), s.id]);
    started.push(r.id);
  }
  return started;
}
export function startScheduler({ intervalMs = 60_000 } = {}) {
  const t = setInterval(() => { try { runDue(); } catch (e) { console.error("scheduler", e); } }, intervalMs);
  t.unref?.();
  return () => clearInterval(t);
}
