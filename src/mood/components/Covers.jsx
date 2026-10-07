import React from "react";

const when = (t) => {
  if (!t) return "";
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

// A board cover: one large image + two small ones, Pinterest-style.
export function Cover({ href, name, meta, pins }) {
  const imgs = pins.slice(0, 3);
  return (
    <a className="cover" href={href}>
      <div className="cover-art" aria-hidden="true">
        {[0, 1, 2].map((i) => (imgs[i] ? <img key={i} src={imgs[i].thumb} alt="" loading="lazy" style={{ background: imgs[i].color || undefined }} /> : <span key={i} />))}
      </div>
      <div className="cover-name">{name}</div>
      <div className="cover-meta">{meta}</div>
    </a>
  );
}

export function ExplorationCovers({ explorations }) {
  return (
    <div className="cover-grid">
      {explorations.map((x) => (
        <Cover
          key={x.id}
          href={`#/x/${x.id}`}
          name={x.brief?.title || "Untitled"}
          meta={[x.brief?.season || x.input?.season, `${x.pins?.length || 0} images`, when(x.updatedAt)].filter(Boolean).join(" · ")}
          pins={x.pins || []}
        />
      ))}
    </div>
  );
}

export function BoardCovers({ boards }) {
  return (
    <div className="cover-grid">
      {boards.map((b) => (
        <Cover key={b.id} href={`#/b/${b.id}`} name={b.name} meta={`${b.pins.length} pin${b.pins.length === 1 ? "" : "s"} · ${when(b.updatedAt)}`} pins={b.pins} />
      ))}
    </div>
  );
}
