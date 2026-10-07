// Mascot Lab — Studio look gallery: every effect rendered live with the current logo
// + palette, on its studio tile. Filters: category chips (All + every category that has
// looks, one scrolling row on phones), a search field (name, print method, category)
// and Favorites. Rendering is lazy: only tiles on (or near) the screen ask the shared
// scheduler for a render (the worker pool takes 2 at a time; the selected tile first,
// visible tiles next); a tile that scrolls away before its turn is dropped from the
// queue, and one that has a render keeps it (marked stale until it scrolls back in when
// the logo or colors change).
import React, { memo, useEffect, useMemo, useRef } from "react";
import { AlertTriangle, Check, Heart, RefreshCw, Search, X } from "lucide-react";
import { Button, CanvasImage, Chip, ChipRow, IconButton, Notice, Skeleton, Spinner, cx } from "../components/index.js";
import { CATEGORIES } from "../../engine/effects/index.js";
import { darken } from "../../engine/core.js";
import { useEffectRender, useHeld, useInView, useQueueStatus } from "./renderKit.js";

export const GALLERY_SIZE = 384;

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
export const catLabel = (id) => CAT_LABEL[id] || "Effect";

/** stageStyle(stage, palette) → inline style for the "team" stage (darkened primary), else null. */
export function stageStyle(stage, palette) {
  if (stage !== "team") return null;
  try { return { background: darken(palette.primary, 0.06) }; } catch { return null; }
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
/** matchesQuery(effect, query) → every word of the query appears in the name, method, category or id. */
export function matchesQuery(e, query) {
  const words = norm(query).split(/[^a-z0-9-]+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(`${e.name} ${e.method} ${catLabel(e.category)} ${e.id}`);
  return words.every((w) => hay.includes(w));
}

export function Gallery({
  effects, loadStatus: status, selectedId, favorites, filter, onFilter, query = "", onQuery,
  onSelect, onToggleFavorite, logo, palette, selectedParams, seed, onSkip, skipLabel, noLogo = false, onUpload,
}) {
  const searchRef = useRef(null);
  const matched = useMemo(() => effects.filter((e) => matchesQuery(e, query)), [effects, query]);
  const counts = useMemo(() => {
    const c = { all: matched.length, fav: matched.filter((e) => favorites.includes(e.id)).length };
    for (const cat of CATEGORIES) c[cat.id] = matched.filter((e) => e.category === cat.id).length;
    return c;
  }, [matched, favorites]);
  // categories with looks in the registry (not just in the search result), in registry order
  const cats = useMemo(() => CATEGORIES.filter((c) => effects.some((e) => e.category === c.id)), [effects]);
  const inFilter = (e) => (filter === "all" ? true : filter === "fav" ? favorites.includes(e.id) : e.category === filter);
  const shownIds = useMemo(() => new Set(matched.filter(inFilter).map((e) => e.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matched, filter, favorites]);
  const nShown = shownIds.size;
  const filterName = filter === "all" ? "All looks" : filter === "fav" ? "Favorites" : catLabel(filter);

  // "/" jumps to the search field (outside text fields)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="st-gallery" aria-labelledby="st-gallery-title">
      <div className="st-gallery__head">
        <div className="st-gallery__bar">
          <div className="st-gallery__title">
            <h2 className="st-h2" id="st-gallery-title">
              Looks{status === "ready" && <span className="st-h2__count">{effects.length}</span>}
            </h2>
            <GalleryStatus loading={status !== "ready"} noLogo={noLogo} />
          </div>
          <div className="st-gallery__tools">
            <SearchField inputRef={searchRef} value={query} onChange={onQuery} />
            <Chip
              className="st-favchip"
              selected={filter === "fav"}
              showCheck={false}
              icon={<Heart aria-hidden="true" className="st-favchip__icon" />}
              count={counts.fav}
              onClick={() => onFilter(filter === "fav" ? "all" : "fav")}
              title={filter === "fav" ? "Show all looks" : "Show only your favorites"}
            >
              Favorites
            </Chip>
          </div>
        </div>
        {status === "ready" && <ChipRow scroll label="Filter looks by category" className="st-filters">
          <Chip selected={filter === "all"} showCheck={false} count={counts.all} onClick={() => onFilter("all")}>All</Chip>
          {cats.map((c) => (
            <Chip key={c.id} selected={filter === c.id} showCheck={false} count={counts[c.id]} onClick={() => onFilter(c.id)}>
              {c.label}
            </Chip>
          ))}
        </ChipRow>}
      </div>

      {status === "loading" && (
        <div className="st-grid" aria-busy="true" aria-label="Loading looks">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="st-tile is-ghost" key={i}>
              <span className="ml-tile st-tile__art"><Skeleton className="st-tile__skel" /></span>
              <span className="ml-card__body st-tile__meta">
                <Skeleton variant="text" width={i % 2 ? "48%" : "62%"} />
                <Skeleton variant="text" width="70%" />
              </span>
            </div>
          ))}
        </div>
      )}
      {status === "error" && (
        <div className="ml-empty ml-empty--error st-empty" role="alert">
          <span className="ml-empty__icon"><AlertTriangle aria-hidden="true" /></span>
          <p className="ml-empty__title">The looks didn't load</p>
          <p className="ml-empty__text">Reload the page to try again.</p>
        </div>
      )}
      {noLogo && (
        <Notice
          tone="warning"
          title="No logo to remix"
          className="st-nologo"
          action={onUpload ? <Button size="sm" variant="secondary" onClick={onUpload}>Upload your logo</Button> : null}
        >
          We couldn't read your logo file, so the looks have nothing to draw. Upload it again, or pick a sample logo.
        </Notice>
      )}
      {status === "ready" && (
        <>
          {onSkip && <button type="button" className="st-skip" onClick={onSkip}>{skipLabel}</button>}
          <p className="sr-only" aria-live="polite">
            {query ? `${nShown} ${nShown === 1 ? "look matches" : "looks match"} “${query}” in ${filterName}.` : `${filterName}: ${nShown} ${nShown === 1 ? "look" : "looks"}.`}
          </p>
          <div className="st-grid">
            {effects.map((e) => (
              <EffectTile
                key={e.id}
                effect={e}
                hidden={!shownIds.has(e.id)}
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
            <EmptyResult
              query={query}
              filter={filter}
              filterName={filterName}
              allMatches={counts.all}
              onClearSearch={() => { onQuery(""); searchRef.current?.focus(); }}
              onShowAll={() => onFilter("all")}
            />
          )}
        </>
      )}
    </section>
  );
}

const EMPTY = Object.freeze({});

/** Search field: a pill with a search icon and a clear button. */
function SearchField({ value, onChange, inputRef }) {
  return (
    <div className="st-search" role="search">
      <Search aria-hidden="true" className="st-search__icon" />
      <input
        ref={inputRef}
        type="search"
        className="st-search__input"
        value={value}
        placeholder="Search looks"
        aria-label="Search looks by name, print method or category"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape" && value) { e.preventDefault(); e.stopPropagation(); onChange(""); } }}
      />
      {value && (
        <button type="button" className="st-search__clear" aria-label="Clear search" onClick={() => { onChange(""); inputRef.current?.focus(); }}>
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Quiet status next to the gallery title, only while something is happening. */
function GalleryStatus({ loading, noLogo }) {
  const { pending } = useQueueStatus();
  const busy = !noLogo && (loading || pending > 0);
  if (!busy && !noLogo) return null;
  return (
    <span className={cx("st-status", busy && "is-busy")} role="status">
      {busy && <Spinner />}
      <span>{loading ? "Loading looks" : noLogo ? "Waiting for a logo" : "Rendering"}</span>
    </span>
  );
}

function EmptyResult({ query, filter, filterName, allMatches, onClearSearch, onShowAll }) {
  let title, text, actions;
  if (query) {
    const elsewhere = filter !== "all" && allMatches > 0;
    title = `No looks match “${query}”${filter !== "all" ? ` in ${filterName}` : ""}`;
    text = elsewhere
      ? `${allMatches} ${allMatches === 1 ? "look matches" : "looks match"} in other groups.`
      : "Try a print method like “screen print” or “embroidery”, or a word like “chrome”.";
    actions = (
      <>
        {elsewhere && <Button size="sm" onClick={onShowAll}>Show all {allMatches}</Button>}
        <Button size="sm" variant={elsewhere ? "outline" : "primary"} onClick={onClearSearch}>Clear search</Button>
      </>
    );
  } else if (filter === "fav") {
    title = "No favorites yet";
    text = "Tap the heart on any look to keep it here.";
    actions = <Button size="sm" variant="outline" onClick={onShowAll}>Show all looks</Button>;
  } else {
    title = "No looks in this group yet";
    text = "More looks are on the way.";
    actions = <Button size="sm" variant="outline" onClick={onShowAll}>Show all looks</Button>;
  }
  return (
    <div className="ml-empty st-empty">
      <span className="ml-empty__icon">{filter === "fav" && !query ? <Heart aria-hidden="true" /> : <Search aria-hidden="true" />}</span>
      <p className="ml-empty__title">{title}</p>
      <p className="ml-empty__text">{text}</p>
      <div className="ml-empty__actions">{actions}</div>
    </div>
  );
}

const EffectTile = memo(function EffectTile({
  effect, hidden, selected, favorite, logo, palette, params, seed, onSelect, onToggleFavorite,
}) {
  const ref = useRef(null);
  const hadCanvas = useRef(false);
  const inView = useInView(ref, { rootMargin: "320px 0px" });
  const held = useHeld();
  // Lazy: a tile renders only while it is on (or near) the screen and not filtered out.
  // The selected tile always renders (its 384 px render is also the inspector's first
  // stand-in): it jumps the queue while it has nothing to show; once it has a render, the
  // inspector's big preview takes precedence, and during a slider drag it waits for the
  // release (the inspector shows drafts meanwhile).
  const r = useEffectRender({
    effect, logo, params, palette, seed,
    size: GALLERY_SIZE, quality: "preview",
    priority: selected ? (hadCanvas.current ? 12 : 40) : 30,
    debounce: selected ? 120 : 0,
    enabled: selected ? !(held && hadCanvas.current) : inView && !hidden,
  });
  hadCanvas.current = !!r.canvas;
  const failed = r.status === "error";
  const stale = !!r.canvas && !r.fresh && !failed;
  const state = failed ? "error" : r.fresh ? "fresh" : r.canvas ? "stale" : r.status === "pending" ? "pending" : "idle";
  const style = stageStyle(effect.stage, palette);
  const meta = `${catLabel(effect.category)} · ${effect.method}`;

  return (
    <div
      ref={ref}
      className={cx("st-tile", selected && "is-selected", failed && "is-failed", favorite && "is-fav")}
      hidden={hidden}
      data-effect={effect.id}
      data-render={state}
    >
      <button
        type="button"
        className="st-tile__hit"
        aria-pressed={selected}
        aria-label={`${effect.name}. ${meta}.${selected ? " Your look." : ""}`}
        onClick={() => onSelect(effect.id)}
      >
        <span className={cx("ml-tile st-tile__art", `ml-tile--${effect.stage}`)} style={style || undefined}>
          {failed ? (
            <span className="st-tile__error">
              <AlertTriangle aria-hidden="true" />
              <span>Couldn't render</span>
            </span>
          ) : (
            <span className="ml-tile__media">
              <CanvasImage canvas={r.canvas} ratio={1} alt={`Your logo in ${effect.name}`} loading={stale} />
            </span>
          )}
        </span>
        <span className="ml-card__body st-tile__meta">
          <span className="ml-card__title st-tile__name">{effect.name}</span>
          <span className="ml-card__meta st-tile__method">{meta}</span>
        </span>
      </button>
      {selected && (
        <span className="st-tile__badge" aria-hidden="true">
          <span className="ml-spec ml-spec--team"><Check />Your look</span>
        </span>
      )}
      {failed && (
        <button type="button" className="st-tile__retry" onClick={r.retry}>
          <RefreshCw aria-hidden="true" /> Retry
        </button>
      )}
      <IconButton
        className={cx("st-tile__fav", favorite && "is-on")}
        variant="glass"
        size="sm"
        pressed={favorite}
        label={favorite ? `Remove ${effect.name} from favorites` : `Add ${effect.name} to favorites`}
        title={favorite ? "Remove from favorites" : "Add to favorites"}
        icon={<Heart aria-hidden="true" />}
        onClick={() => onToggleFavorite(effect.id)}
      />
    </div>
  );
});

export default Gallery;
