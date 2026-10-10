// Planning views over every published market: what happens in a month, and
// what needs action in that month for something later. Both read the timing
// model, so a 2027 moment never shows up as this month's news in 2026.
import { markets } from "./data.js";
import { runsIn, ymOf } from "./review.js";

export const published = () => markets.filter((m) => m.status === "complete");

export const allCalendar = () => published().flatMap((m) => (m.calendar || []).map((c, i) => ({ ...c, i, m })));
export const allOpportunities = () => published().flatMap((m) => (m.opportunities || []).map((o) => ({ ...o, m })));

const byPriority = (a, b) => a.priority - b.priority || (a.m.team.city || "").localeCompare(b.m.team.city || "");

// Events, launches and seasons that run during ym.
export function happeningIn(ym) {
  return allCalendar().filter((c) => c.timing && c.timing.kind !== "action" && runsIn(c.timing, ym)).sort(byPriority);
}

// Work due in ym for something that happens later: action windows open in ym,
// calendar entries whose act-by month has arrived, and opportunities whose
// first decision is due while their product is still ahead.
export function actionIn(ym) {
  const calendar = allCalendar().filter((c) => c.timing && (
    (c.timing.kind === "action" && runsIn(c.timing, ym)) ||
    (c.timing.actBy && ymOf(c.timing.actBy) <= ym && ymOf(c.timing.start) > ym)
  )).sort(byPriority);
  const opportunities = allOpportunities().filter((o) => o.handoff && ymOf(o.handoff.actBy) <= ym && ymOf(o.handoff.firstInMarket) >= ym).sort(byPriority);
  return { calendar, opportunities };
}
