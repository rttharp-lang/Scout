// Mascot Lab — Studio effect gallery: every effect rendered live with the current
// logo + palette, filtered by category / favorites. Tiles render through the
// shared scheduler: the selected tile first, on-screen tiles next, the rest after.
import React, { memo, useMemo, useRef } from "react";
import { AlertTriangle, Check, RefreshCw, Star } from "lucide-react";
import { Button, CanvasImage, Chip, ChipRow, Notice, Skeleton, cx } from "../components/index.js";
import { CATEGORIES } from "../../engine/effects/index.js";
import { darken } from "../../engine/core.js";
import { useEffectRender, useHeld, useInView } from "./renderKit.js";

export const GALLERY_SIZE = 384;
const pad2 = (n) => String(n).padStart(2, "0");

/** stageStyle(stage, palette) → inline style for the "team" stage (darkened primary), else null. */
export function stageStyle(stage, palette) {
  if (stage !== "team") return null;
  try { return { background: darken(palette.primary, 0.06) }; } catch { return null; }
}

export function Gallery({
  effects, loadStatus: status, status: statusNode, selectedId, favorites, filter, onFilter, onSelect, onToggleFavorite,
  logo, palette, selectedParams, seed, numbers, onSkip, skipLabel, noLogo = false, onUpload,
}) {
  const counts = useMemo(() => {
    const c = { all: effects.length, fav: effects.filter((e) => favorites.includes(e.id)).length };
    for (const cat of CATEGORIES) c[cat.id] = effects.filter((e) => e.category === cat.id).length;
    return c;
  }, [effects, favorites]);

  const visibleCats = CATEGORIES.filter((c) => counts[c.id] > 0);
  const shown = (e) =>
    filter === "all" ? true : filter === "fav" ? favorites.includes(e.id) : e.category === filter;
  const nShown = effects.filter(shown).length;

  return (
    <section className="st-gallery" aria-labelledby="st-gallery-title">
      <div className="st-gallery__head">
        <div className="st-gallery__title">
          <h2 className="st-h2" id="st-gallery-title">Effects</h2>
          {statusNode}
          <Chip
            size="sm"
            className="st-favchip"
            selected={filter === "fav"}
            showCheck={false}
            icon={<Star aria-hidden="true" className="st-filters__star" />}
            count={counts.fav}
            onClick={() => onFilter(filter === "fav" ? "all" : "fav")}
          >
            Favorites
          </Chip>
        </div>
        <ChipRow scroll label="Filter effects" className="st-filters">
          <Chip size="sm" selected={filter === "all"} showCheck={false} count={counts.all} onClick={() => onFilter("all")}>All</Chip>
          {visibleCats.map((c) => (
            <Chip key={c.id} size="sm" selected={filter === c.id} showCheck={false} count={counts[c.id]} onClick={() => onFilter(c.id)}>
              {c.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {status === "loading" && (
        <div className="st-grid" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="st-tile is-ghost" key={i}>
              <div className="st-tile__art"><Skeleton /></div>
              <div className="st-tile__meta"><Skeleton variant="text" width="60%" /></div>
            </div>
          ))}
        </div>
      )}
      {status === "error" && (
        <p className="st-empty">The effects didn't load. Reload the page to try again.</p>
      )}
      {noLogo && (
        <Notice
          tone="warning"
          title="No logo to remix"
          className="st-nologo"
          action={onUpload ? <Button size="sm" variant="secondary" onClick={onUpload}>Upload your logo</Button> : null}
        >
          We couldn't read your logo file, so the effects have nothing to draw. Upload it again, or pick a sample in the logo panel.
        </Notice>
      )}
      {status === "ready" && (
        <>
          {onSkip && <button type="button" className="st-skip" onClick={onSkip}>{skipLabel}</button>}
          <div className="st-grid">
            {effects.map((e) => (
              <EffectTile
                key={e.id}
                effect={e}
                number={numbers[e.id]}
                hidden={!shown(e)}
                selected={e.id === selectedId}
                favorite={favorites.includes(e.id)}
                logo={logo}
                palette={palette}
                params={e.id === selectedId ? selectedParams : EMPTY}
                seed={e.id === selectedId ? seed : 7}
                onSelect={onSelect}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
          {nShown === 0 && (
            <p className="st-empty">
              {filter === "fav"
                ? "No favorites yet. Tap the star on any effect to keep it here."
                : "No effects in this group yet."}
            </p>
          )}
        </>
      )}
    </section>
  );
}

const EMPTY = Object.freeze({});

const EffectTile = memo(function EffectTile({
  effect, number, hidden, selected, favorite, logo, palette, params, seed, onSelect, onToggleFavorite,
}) {
  const ref = useRef(null);
  const hadCanvas = useRef(false);
  const inView = useInView(ref);
  const held = useHeld();
  // the selected tile jumps the queue only while it has nothing to show; once it has a
  // render, the inspector's big preview takes precedence while the coach tunes, and
  // during a slider drag it waits for the release (the inspector shows drafts)
  const r = useEffectRender({
    effect, logo, params, palette, seed,
    size: GALLERY_SIZE, quality: "preview",
    priority: selected ? (hadCanvas.current ? 12 : 40) : inView && !hidden ? 30 : 0,
    debounce: selected ? 120 : 0,
    enabled: !(selected && held && hadCanvas.current),
  });
  hadCanvas.current = !!r.canvas;
  const failed = r.status === "error";
  const busy = r.status === "pending" && !!r.canvas;
  const style = stageStyle(effect.stage, palette);

  return (
    <div ref={ref} className={cx("st-tile", selected && "is-selected", failed && "is-failed")} hidden={hidden} data-effect={effect.id}>
      <button
        type="button"
        className="st-tile__hit"
        aria-pressed={selected}
        aria-label={`${effect.name}. ${effect.method}.${selected ? " Selected." : ""}`}
        onClick={() => onSelect(effect.id)}
      >
        <span className={cx("st-tile__art", `ml-stage--${effect.stage}`)} style={style || undefined}>
          {failed ? (
            <span className="st-tile__error">
              <AlertTriangle aria-hidden="true" />
              <span>Couldn't render</span>
            </span>
          ) : (
            <CanvasImage
              canvas={r.canvas}
              ratio={1}
              alt={`Your logo in ${effect.name}`}
              loading={busy}
              className="st-tile__canvas"
            />
          )}
        </span>
        <span className="st-tile__meta">
          <span className="st-tile__name">{effect.name}</span>
          <span className="st-tile__method">{effect.method}</span>
        </span>
      </button>
      <span className="st-tile__num" aria-hidden="true">FX {pad2(number)}</span>
      {selected && (
        <span className="st-tile__badge" aria-hidden="true"><Check /></span>
      )}
      {failed && (
        <button type="button" className="st-tile__retry" onClick={r.retry}>
          <RefreshCw aria-hidden="true" /> Retry
        </button>
      )}
      <button
        type="button"
        className={cx("st-tile__fav", favorite && "is-on")}
        aria-pressed={favorite}
        aria-label={favorite ? `Remove ${effect.name} from favorites` : `Add ${effect.name} to favorites`}
        title={favorite ? "Remove from favorites" : "Add to favorites"}
        onClick={() => onToggleFavorite(effect.id)}
      >
        <Star aria-hidden="true" />
      </button>
    </div>
  );
});

export default Gallery;
