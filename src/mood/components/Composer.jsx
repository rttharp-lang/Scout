import React, { useState } from "react";
import { ArrowRight } from "lucide-react";

export const SEASON_CODES = [
  { code: "SP", label: "SP · Spring" },
  { code: "SU", label: "SU · Summer" },
  { code: "FA", label: "FA · Fall" },
  { code: "HO", label: "HO · Holiday" },
  { code: "SS", label: "SS · Spring/Summer" },
  { code: "FW", label: "FW · Fall/Winter" },
  { code: "RS", label: "RS · Resort" },
  { code: "PF", label: "PF · Pre-Fall" },
];

export const CATEGORIES = ["Women's", "Men's", "Kids", "Running", "Training", "Basketball", "Football", "Outdoor", "Lifestyle", "Streetwear", "Tailoring", "Accessories"];

export const EXAMPLES = [
  "Night-running clubs in Tokyo and Lagos — wet streets, reflective light, community over competition. Technical but quiet.",
  "1970s American trail runners meet Japanese mountain workwear: patina, repair, earth tones and honest materials.",
  "Basketball off the court — Paris summer playgrounds, tailored ease, terrace-culture colour, everything sun-faded.",
  "LA 2028 optimism: Californian modernism, pool light, Op-art graphics, pared-back performance.",
  "Arctic expedition archive reimagined for the city: insulation as architecture, oversized volume, ice light.",
];

// Design works ~18 months ahead: default to the Nike-style quarter season that
// lands then (e.g. October 2026 → SP28).
export function defaultSeason(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() + 18, 1);
  const q = ["SP", "SP", "SP", "SU", "SU", "SU", "FA", "FA", "FA", "HO", "HO", "HO"][d.getMonth()];
  return { code: q, year: d.getFullYear() };
}

export default function Composer({ busy, onSubmit, initial }) {
  const def = defaultSeason();
  const [direction, setDirection] = useState(initial?.direction || "");
  const [code, setCode] = useState(initial?.seasonCode || def.code);
  const [year, setYear] = useState(initial?.seasonYear || def.year);
  const [cats, setCats] = useState(() => new Set(initial?.categories || []));
  const [more, setMore] = useState(Boolean(initial?.consumer || initial?.avoid));
  const [consumer, setConsumer] = useState(initial?.consumer || "");
  const [avoid, setAvoid] = useState(initial?.avoid || "");
  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear + 1, thisYear + 2, thisYear + 3];

  const toggle = (c) => setCats((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const submit = (e) => {
    e?.preventDefault();
    if (!direction.trim() || busy) return;
    onSubmit({
      direction: direction.trim(),
      season: `${code}${String(year).slice(2)}`,
      categories: [...cats],
      consumer: consumer.trim(),
      avoid: avoid.trim(),
    });
  };

  return (
    <form className="composer" onSubmit={submit} aria-label="Creative direction">
      <label htmlFor="direction" className="field-label">Creative direction</label>
      <textarea
        id="direction"
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e); }}
        placeholder="Describe the season the way you'd brief your team — the feeling, the places, the people, the references, what it must never become…"
        maxLength={2000}
        required
      />
      <div className="composer-grid">
        <div>
          <span className="field-label" id="season-label">Season</span>
          <div className="season-picker" role="group" aria-labelledby="season-label">
            <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Season">
              {SEASON_CODES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div>
          <span className="field-label" id="cat-label">Category <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(optional)</span></span>
          <div className="chip-row" role="group" aria-labelledby="cat-label">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={cats.has(c)} onClick={() => toggle(c)}>{c}</button>
            ))}
          </div>
        </div>
      </div>
      {more && (
        <div className="composer-grid">
          <div>
            <label className="field-label" htmlFor="consumer">Consumer & brand context</label>
            <textarea id="consumer" className="field" style={{ minHeight: 80, fontSize: 15 }} value={consumer} onChange={(e) => setConsumer(e.target.value)} placeholder="Who it's for, price tier, brand codes to respect…" maxLength={500} />
          </div>
          <div>
            <label className="field-label" htmlFor="avoid">Steer away from</label>
            <textarea id="avoid" className="field" style={{ minHeight: 80, fontSize: 15 }} value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="Clichés, colours, references or competitors' codes to avoid…" maxLength={500} />
          </div>
        </div>
      )}
      <div className="composer-foot">
        <button type="button" className="more-toggle" onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {more ? "Fewer options" : "Add consumer context & things to avoid"}
        </button>
        <button type="submit" className="btn btn-primary btn-lg" disabled={!direction.trim() || busy}>
          {busy ? "Building the brief…" : "Build the mood board"} <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="examples">
        <span className="field-label">Or start from a direction</span>
        <div className="chip-row">
          {EXAMPLES.map((x) => <button key={x} type="button" className="chip" onClick={() => setDirection(x)}>{x}</button>)}
        </div>
      </div>
    </form>
  );
}
