// Deterministic metric calculations. Missing coverage stays missing (null),
// never zero. Spikes are detected per team+platform+metric against a
// transparent rolling baseline and reported with sample size, baseline window
// and collection notes. No cross-metric sums, no team rankings by raw volume.
import { q, rows, insertEntity } from "../db.js";

export function recordObservation({ workspace_id, team_id, platform, metric, observed_at, value, collection, post_age_hours = null, note = null, run_id = null }) {
  return insertEntity({ entity_type: "metric_observation", workspace_id, team_id, title: `${platform}:${metric}`, status: "observed", run_id, starts_at: observed_at,
    data: { platform, metric, value, collection: collection || {}, post_age_hours, note } });
}

export function observations(workspace_id, team_id, { platform, metric } = {}) {
  const all = rows(q("SELECT * FROM entities WHERE workspace_id=? AND team_id=? AND entity_type='metric_observation' ORDER BY starts_at ASC", [workspace_id, team_id]));
  return all.filter((o) => (!platform || o.data.platform === platform) && (!metric || o.data.metric === metric));
}

// Rolling median baseline with MAD; spike when value > median + k*MAD and at least `minSamples` in the window.
export function detectSpikes(series, { windowDays = 28, k = 3, minSamples = 7 } = {}) {
  const pts = series.filter((p) => p.value != null && p.at).map((p) => ({ ...p, t: Date.parse(p.at) })).sort((a, b) => a.t - b.t);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const w = pts.filter((p) => p.t < pts[i].t && pts[i].t - p.t <= windowDays * 864e5).map((p) => p.value);
    if (w.length < minSamples) { out.push({ ...pts[i], baseline: null, spike: null, reason: `insufficient baseline (${w.length}/${minSamples} samples)` }); continue; }
    const sorted = [...w].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const mad = [...w.map((v) => Math.abs(v - med))].sort((a, b) => a - b)[Math.floor(w.length / 2)] || 0;
    const threshold = med + k * (mad || med * 0.25 || 1);
    out.push({ ...pts[i], baseline: { median: med, mad, window_days: windowDays, samples: w.length, threshold }, spike: pts[i].value > threshold });
  }
  return out;
}

export function seriesFor(workspace_id, team_id, platform, metric) {
  const obs = observations(workspace_id, team_id, { platform, metric });
  const series = obs.map((o) => ({ at: o.starts_at, value: o.data.value, collection: o.data.collection, post_age_hours: o.data.post_age_hours, id: o.id }));
  const collectionChanges = [...new Set(obs.map((o) => o.data.collection?.method).filter(Boolean))];
  return { platform, metric, definition: obs[0]?.data.collection?.definition || null, sample_size: series.length, collection_methods: collectionChanges,
    points: detectSpikes(series), coverage_note: series.length ? null : "No observations collected; not zero." };
}
