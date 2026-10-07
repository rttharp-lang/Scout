import React, { useEffect, useRef } from "react";
import { creditsText } from "../exportBoard.js";

// Print layout (hidden on screen): a cover page with the brief, one page per
// story with its images and credits, and a credits page. The browser's
// "Save as PDF" turns it into a board a team can drop into a deck.
// Calls onReady once every image has loaded (or after a timeout).
export default function PrintBoard({ name, brief, pins, onReady }) {
  const ref = useRef(null);
  useEffect(() => {
    const imgs = [...(ref.current?.querySelectorAll("img") || [])];
    let left = imgs.length;
    let fired = false;
    const fire = () => { if (!fired) { fired = true; onReady?.(); } };
    if (!left) { fire(); return undefined; }
    const tick = () => { if (--left <= 0) fire(); };
    imgs.forEach((im) => { if (im.complete) tick(); else { im.addEventListener("load", tick, { once: true }); im.addEventListener("error", tick, { once: true }); } });
    const t = setTimeout(fire, 9000);
    return () => clearTimeout(t);
  }, [onReady]);

  const groups = brief?.stories?.length
    ? brief.stories.map((s) => ({ key: s.id, name: s.name, role: s.role, narrative: s.narrative, pins: pins.filter((p) => p.storyId === s.id) })).filter((g) => g.pins.length)
    : [{ key: "all", name, narrative: "", pins }];
  const rest = brief?.stories?.length ? pins.filter((p) => !brief.stories.some((s) => s.id === p.storyId)) : [];
  if (rest.length) groups.push({ key: "more", name: "More references", narrative: "", pins: rest });

  return (
    <div className="print-board" ref={ref}>
      <section className="pb-cover">
        <div>
          <div className="pb-kicker">{brief?.season ? `${brief.season} · ` : ""}Scout Mood</div>
          <h1 className="pb-title">{brief?.title || name}</h1>
          {brief?.tagline && <p className="pb-text"><em>{brief.tagline}</em></p>}
          {brief?.concept && <p className="pb-text">{brief.concept}</p>}
          {brief?.macro?.shift && <><div className="pb-h">The shift</div><p className="pb-text">{brief.macro.shift}</p></>}
          {brief?.macro?.drivers?.length > 0 && <><div className="pb-h">Drivers</div>{brief.macro.drivers.map((d, i) => <p key={i} className="pb-text"><b>{d.pillar}.</b> {d.signal}{d.implication ? ` → ${d.implication}` : ""}</p>)}</>}
          {brief?.macro?.consumer?.mindset && <><div className="pb-h">The consumer{brief.macro.consumer.name ? ` — ${brief.macro.consumer.name}` : ""}</div><p className="pb-text">{brief.macro.consumer.mindset}</p></>}
        </div>
        <div>
          {brief?.palette?.length > 0 && (
            <>
              <div className="pb-h">Palette</div>
              <div className="pb-palette">
                {brief.palette.map((c) => <div key={c.hex + c.name} className="pb-swatch"><i style={{ background: c.hex }} />{c.name}<br />{c.hex} · {c.role}</div>)}
              </div>
            </>
          )}
          {[["Materials", brief?.materials], ["Silhouettes", brief?.silhouettes], ["Details", brief?.details], ["Graphics", brief?.graphics], ["References", brief?.references]].map(([t, items]) => (
            items?.length ? <div key={t}><div className="pb-h">{t}</div><div className="pb-text">{items.join(" · ")}</div></div> : null
          ))}
        </div>
      </section>
      {groups.map((g) => (
        <section key={g.key} className="pb-story">
          <h2 className="pb-story-name">{g.name}</h2>
          {g.role && <div className="pb-kicker">{g.role} story</div>}
          {g.narrative && <p className="pb-text">{g.narrative}</p>}
          <div className="pb-images">
            {g.pins.map((p) => (
              <figure key={p.id} className="pb-img">
                <img src={p.src || p.thumb} alt={p.alt || ""} />
                <figcaption>{p.attribution || p.sourceLabel}{p.approval ? ` · Approved by ${p.approval.by}` : ""}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      <section className="pb-credits">
        <div className="pb-h">Image credits & licenses</div>
        {creditsText(pins)}
      </section>
    </div>
  );
}
