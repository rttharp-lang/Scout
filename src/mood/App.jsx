import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, ChevronDown, Copy, FileArchive, LogIn, LogOut, Pencil, Printer, RefreshCw, Send, Trash2, Wand2, X } from "lucide-react";
import { supabase, authEnabled } from "../supabase";
import { fetchBrief, curateStory, explainError } from "./api.js";
import { uid, loadExplorations, loadBoards, saveExplorations, saveBoards, pushRemote, deleteRemote, pullRemote, syncDeletes, addTombstone, mergeLists, parseList, KEY_EXPLORATIONS, KEY_BOARDS, KEY_DELETED } from "./store.js";
import { libraryEnabled, getMyCurator, approvalsFor, matchLibrary, approve, revoke, requestReview, imageBase, approvalOf } from "./library.js";
import { briefMarkdown, copyImage, copyText, creditsText, downloadPin, exportZip } from "./exportBoard.js";
import Logo from "./components/Logo.jsx";
import Masonry from "./components/Masonry.jsx";
import Tile, { SkeletonTile, ratioOf } from "./components/Tile.jsx";
import Closeup from "./components/Closeup.jsx";
import BoardPicker from "./components/BoardPicker.jsx";
import BriefPanel from "./components/BriefPanel.jsx";
import Composer from "./components/Composer.jsx";
import { BoardCovers, ExplorationCovers } from "./components/Covers.jsx";
import { RefineDialog, RenameDialog, ReviewDialog } from "./components/Dialogs.jsx";
import PrintBoard from "./components/PrintBoard.jsx";
import CuratorStudio, { tagsFor } from "./components/CuratorStudio.jsx";

// ── Routing (hash-based, so the page works from any static host) ────────
export function parseRoute(hash) {
  const parts = String(hash || "").replace(/^#\/?/, "").split(/[/?]/).filter(Boolean);
  if (parts[0] === "x" && parts[1]) return { name: "exploration", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "b" && parts[1]) return { name: "board", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "boards") return { name: "boards" };
  if (parts[0] === "curate") return { name: "curate" };
  return { name: "home" };
}
const go = (h) => { if (window.location.hash !== h) window.location.hash = h; };

const KEEP_PER_STORY = 12;
const REVIEW_LIMIT = 60;
const LAST_BOARD_KEY = "scout.mood.lastBoard.v1";
const SKELETON_RATIOS = [1.25, 1.5, 0.8, 1.33];

// A story's pins in board order: designer-approved library picks first, then
// each round of curation in the order it was kept (best-scored first).
export function storyPins(pins, storyId) {
  const mine = pins.filter((p) => p.storyId === storyId);
  return [...mine.filter((p) => p.fromLibrary), ...mine.filter((p) => !p.fromLibrary).sort((a, b) => (a.round || 1) - (b.round || 1))];
}

const dedupe = (pins) => { const seen = new Set(); return pins.filter((p) => (seen.has(p.id) ? false : seen.add(p.id))); };
const now = () => Date.now();
const readLastBoard = () => { try { return localStorage.getItem(LAST_BOARD_KEY) || ""; } catch { return ""; } };
const writeLastBoard = (id) => { try { localStorage.setItem(LAST_BOARD_KEY, id); } catch {} };

// Toasts can carry one action ("Undo", "Change"); those stay up longer.
function useToast() {
  const [toast, setToast] = useState(null);
  const t = useRef(null);
  const show = useCallback((msg, action) => {
    setToast({ msg, action, key: now() });
    clearTimeout(t.current);
    t.current = setTimeout(() => setToast(null), action ? 6000 : 2800);
  }, []);
  const hide = useCallback(() => { clearTimeout(t.current); setToast(null); }, []);
  return [toast, show, hide];
}

// ── Header ────────────────────────────────────────────────────────────────
function Header({ route, boardsCount, session, onSignIn, onSignOut, showCurate }) {
  return (
    <header className="mood-head">
      <a href="#/" aria-label="Scout Mood — new board" style={{ textDecoration: "none" }}><Logo /></a>
      <nav className="mood-nav" aria-label="Main">
        <a className="mood-navlink" href="#/" aria-current={route.name === "home" ? "page" : undefined}>New</a>
        <a className="mood-navlink" href="#/boards" aria-current={route.name === "boards" || route.name === "board" ? "page" : undefined}>Boards{boardsCount ? <span className="count">{boardsCount}</span> : null}</a>
        {showCurate && <a className="mood-navlink" href="#/curate" aria-current={route.name === "curate" ? "page" : undefined}>Curate</a>}
        {authEnabled && (session
          ? <button type="button" className="mood-navlink" onClick={onSignOut} title={session.user?.email}><LogOut size={15} aria-hidden="true" style={{ verticalAlign: -2 }} /> <span className="sr-only">Sign out</span></button>
          : <button type="button" className="mood-navlink" onClick={onSignIn}><LogIn size={15} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />Sign in</button>)}
      </nav>
    </header>
  );
}

function ExportMenu({ onZip, onPrint, onCopy, zipProgress, copyLabel = "Copy brief" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  const pick = (fn) => () => { setOpen(false); fn(); };
  return (
    <div className="pop-anchor" ref={ref}>
      <button type="button" className="btn btn-ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} disabled={Boolean(zipProgress)}>
        {zipProgress ? `Zipping ${zipProgress}` : "Export"} <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="popover left" role="menu">
          <button type="button" role="menuitem" className="pop-item" onClick={pick(onZip)}><FileArchive size={18} aria-hidden="true" /><span>Download images (.zip)<small>A folder per story + credits.csv + brief</small></span></button>
          <button type="button" role="menuitem" className="pop-item" onClick={pick(onPrint)}><Printer size={18} aria-hidden="true" /><span>Print / save as PDF<small>A presentation-ready board</small></span></button>
          <button type="button" role="menuitem" className="pop-item" onClick={pick(onCopy)}><Copy size={18} aria-hidden="true" /><span>{copyLabel}<small>Markdown, ready to paste</small></span></button>
        </div>
      )}
    </div>
  );
}

function SourceNotice({ sources }) {
  const s = sources || {};
  if (["unsplash", "pexels"].every((k) => s[k] === "not-configured")) {
    return <div className="notice warn">Stock photography isn't connected on this deployment (set <code>UNSPLASH_ACCESS_KEY</code> and/or <code>PEXELS_API_KEY</code>), so this board draws on Wikimedia Commons' juried photography and museum archives only.</div>;
  }
  const down = Object.entries(s).filter(([, v]) => v === "error").map(([k]) => k);
  if (down.length) return <div className="notice warn">{down.join(" and ")} didn't respond for some searches (rate limits are the usual cause) — the board uses what came back.</div>;
  return null;
}

const phaseText = (st) => (st.phase === "searching" ? "searching sources…"
  : st.phase === "curating" ? `curating ${st.considered} candidates…`
    : st.phase === "error" ? st.error
      : `${st.kept} of ${st.considered} kept`);

// ── App ───────────────────────────────────────────────────────────────────
export default function MoodApp() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const [explorations, setExplorations] = useState(loadExplorations);
  const [boards, setBoards] = useState(loadBoards);
  const [status, setStatus] = useState({}); // { [explorationId]: { brief?: {...}, [storyId]: {...} } } — transient
  const [approvals, setApprovals] = useState({}); // { [imageId]: Approval[] }
  const [session, setSession] = useState(null);
  const [curator, setCurator] = useState(null);
  const [picker, setPicker] = useState(null);
  const [closeup, setCloseup] = useState(null); // { pin, list, ctx }
  const [related, setRelated] = useState({}); // { [pinId]: { status, pins, error } }
  const [dialog, setDialog] = useState(null); // { type, ... }
  const [printing, setPrinting] = useState(null);
  const [zipProgress, setZipProgress] = useState("");
  const [toast, showToast, hideToast] = useToast();
  // Tiles whose image failed to load are hidden for this session only — a
  // network blip must never delete curated pins from storage.
  const [broken, setBroken] = useState(() => new Set());
  const markBroken = useCallback((p) => setBroken((s) => (s.has(p.id) ? s : new Set(s).add(p.id))), []);

  const xRef = useRef(explorations);
  xRef.current = explorations;
  const bRef = useRef(boards);
  bRef.current = boards;
  const closeupRef = useRef(closeup);
  closeupRef.current = closeup;
  const dirty = useRef(new Map()); // id -> kind, pending remote push

  // Routing
  useEffect(() => {
    const on = () => { setRoute(parseRoute(window.location.hash)); setCloseup(null); setPicker(null); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // The closeup owns one history entry, so the back button (and the Android
  // back gesture) closes it instead of leaving the board.
  useEffect(() => {
    const onPop = () => setCloseup(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Local persistence (every change) + debounced account sync.
  useEffect(() => { saveExplorations(explorations); }, [explorations]);
  useEffect(() => {
    if (!saveBoards(boards)) showToast("This browser's storage is full — sign in to keep boards in your account, or export them.");
  }, [boards, showToast]);
  // Other tabs: merge their writes (and deletes) instead of overwriting them.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY_EXPLORATIONS) setExplorations((cur) => mergeLists(cur, parseList(e.newValue)));
      else if (e.key === KEY_BOARDS) setBoards((cur) => mergeLists(cur, parseList(e.newValue)));
      else if (e.key === KEY_DELETED) { setExplorations((cur) => mergeLists(cur, [])); setBoards((cur) => mergeLists(cur, [])); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const userId = session?.user?.id || null;
  useEffect(() => {
    if (!userId || !dirty.current.size) return undefined;
    const t = setTimeout(() => {
      const pending = [...dirty.current.entries()];
      dirty.current.clear();
      pending.forEach(([id, kind]) => {
        const obj = (kind === "board" ? bRef.current : xRef.current).find((o) => o.id === id);
        if (obj) pushRemote(kind, obj).catch(() => dirty.current.set(id, kind));
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [explorations, boards, userId]);

  // Auth + curator profile + pulling boards from the account.
  useEffect(() => {
    if (!authEnabled) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  // Keyed on the user, not the session object: supabase-js re-emits the
  // session on every tab refocus and token refresh. Remote rows are merged into
  // the CURRENT state, so nothing made while the pull is in flight is lost.
  useEffect(() => {
    if (!userId) { setCurator(null); return; }
    getMyCurator().then(setCurator).catch(() => setCurator(null));
    syncDeletes().catch(() => {});
    pullRemote().then((rows) => {
      if (!rows) return;
      setExplorations((cur) => mergeLists(cur, rows.explorations));
      setBoards((cur) => mergeLists(cur, rows.boards));
    }).catch(() => {});
  }, [userId]);
  const signIn = useCallback(() => {
    if (!authEnabled) return;
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/moodboard/`, queryParams: { prompt: "select_account" } } });
  }, []);
  const signOut = useCallback(() => supabase?.auth.signOut(), []);

  // ── State helpers ──────────────────────────────────────────────────────
  const updateX = useCallback((id, fn) => {
    setExplorations((list) => list.map((x) => (x.id === id ? { ...fn(x), updatedAt: now() } : x)));
    dirty.current.set(id, "exploration");
  }, []);
  const updateBoards = useCallback((fn, touchedIds = []) => {
    setBoards((list) => fn(list));
    touchedIds.forEach((id) => dirty.current.set(id, "board"));
  }, []);
  const setStoryStatus = useCallback((xid, key, st) => {
    setStatus((s) => ({ ...s, [xid]: { ...(s[xid] || {}), [key]: st } }));
  }, []);
  // Some sources (The Met) give no pixel size: tiles report it once loaded.
  const measurePin = useCallback((pin, w, h) => {
    if (!(w > 0 && h > 0)) return;
    const needs = (p) => p.id === pin.id && !(p.width > 0 && p.height > 0);
    const patch = (p) => (needs(p) ? { ...p, width: w, height: h } : p);
    setExplorations((l) => (l.some((x) => x.pins.some(needs)) ? l.map((x) => (x.pins.some(needs) ? { ...x, pins: x.pins.map(patch) } : x)) : l));
    setBoards((l) => (l.some((b) => b.pins.some(needs)) ? l.map((b) => (b.pins.some(needs) ? { ...b, pins: b.pins.map(patch) } : b)) : l));
    setRelated((r) => {
      if (!Object.values(r).some((v) => v.pins?.some(needs))) return r;
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v, pins: (v.pins || []).map(patch) }]));
    });
  }, []);

  const refreshApprovals = useCallback(async (ids) => {
    if (!libraryEnabled || !ids.length) return;
    try {
      const found = await approvalsFor(ids);
      setApprovals((a) => {
        const next = { ...a };
        ids.forEach((id) => { if (found[id]) next[id] = found[id]; else delete next[id]; });
        return next;
      });
    } catch {}
  }, []);

  // ── Generation ─────────────────────────────────────────────────────────
  const runStory = useCallback(async (xid, story, page, round) => {
    const x = xRef.current.find((e) => e.id === xid);
    if (!x?.brief || !story) return;
    const exclude = new Set([...x.pins.map((p) => p.id), ...(x.hidden || [])]);
    const existing = x.pins.filter((p) => p.storyId === story.id);
    const attempt = () => curateStory({
      brief: x.brief, story, page, exclude, existing, keep: KEEP_PER_STORY,
      onStatus: (st) => setStoryStatus(xid, story.id, st),
    });
    try {
      let res;
      try { res = await attempt(); } catch (e) {
        if (e?.code !== "ai-rate-limited" && e?.status !== 429) throw e;
        await new Promise((r) => setTimeout(r, 4000));
        res = await attempt();
      }
      const pins = res.pins.map((p) => ({ ...p, round, explorationId: xid }));
      updateX(xid, (cur) => ({
        ...cur,
        pins: dedupe([...cur.pins, ...pins]),
        pages: { ...(cur.pages || {}), [story.id]: page },
        exhausted: { ...(cur.exhausted || {}), [story.id]: Boolean(res.exhausted) },
        sources: { ...(cur.sources || {}), ...res.sources },
      }));
      setStoryStatus(xid, story.id, { phase: "done", kept: pins.length, considered: res.considered });
      refreshApprovals(pins.map((p) => p.id));
    } catch (e) {
      setStoryStatus(xid, story.id, { phase: "error", error: explainError(e) });
    }
  }, [updateX, setStoryStatus, refreshApprovals]);

  const runRound = useCallback((xid, storyIds) => {
    const x = xRef.current.find((e) => e.id === xid);
    if (!x?.brief) return;
    const round = Math.max(0, ...x.pins.map((p) => p.round || 0)) + 1;
    const stories = x.brief.stories.filter((s) => (!storyIds || storyIds.includes(s.id)) && !(x.exhausted || {})[s.id]);
    stories.forEach((s) => runStory(xid, s, ((x.pages || {})[s.id] || 0) + 1, round));
  }, [runStory]);

  // Seed a new board with designer-approved library images that match it.
  const seedFromLibrary = useCallback(async (xid, brief) => {
    if (!libraryEnabled) return;
    try {
      const keywords = [...brief.stories.flatMap((s) => s.keywords || []), ...String(brief.title).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)];
      const matches = await matchLibrary(keywords, 12);
      if (!matches.length) return;
      const pins = matches.map(({ image, approval }) => {
        const story = brief.stories.map((s) => ({ s, n: (s.keywords || []).filter((k) => approval.tags.includes(k)).length })).sort((a, b) => b.n - a.n)[0]?.s;
        // The designer's note lives on the approval, not in the AI-note field.
        return { ...image, storyId: story?.id || brief.stories[0]?.id, note: "", role: image.role || "lateral", fromLibrary: true, explorationId: xid };
      });
      setApprovals((a) => ({ ...a, ...Object.fromEntries(matches.map((m) => [m.image.id, [m.approval]])) }));
      updateX(xid, (cur) => ({ ...cur, pins: dedupe([...pins, ...cur.pins]) }));
      refreshApprovals(pins.map((p) => p.id));
    } catch {}
  }, [updateX, refreshApprovals]);

  const runBrief = useCallback(async (xid, refine) => {
    const x = xRef.current.find((e) => e.id === xid);
    if (!x) return;
    setStoryStatus(xid, "brief", { phase: "writing" });
    try {
      const brief = await fetchBrief(x.input, refine);
      updateX(xid, (cur) => ({ ...cur, brief }));
      setStoryStatus(xid, "brief", { phase: "done" });
      xRef.current = xRef.current.map((e) => (e.id === xid ? { ...e, brief } : e));
      seedFromLibrary(xid, brief);
      runRound(xid);
    } catch (e) {
      setStoryStatus(xid, "brief", { phase: "error", error: explainError(e) });
    }
  }, [updateX, setStoryStatus, seedFromLibrary, runRound]);

  const startExploration = useCallback((input, { parent, refine } = {}) => {
    // The refine base (parent brief + note) travels with the child, so a retry
    // still refines even if the parent exploration is gone by then.
    const x = { id: uid(), createdAt: now(), updatedAt: now(), input, brief: null, pins: [], hidden: [], pages: {}, exhausted: {}, sources: {}, parentId: parent?.id || null, refinedWith: refine?.instruction || null, refineBase: refine || null };
    xRef.current = [x, ...xRef.current];
    setExplorations((l) => [x, ...l]);
    go(`#/x/${x.id}`);
    runBrief(x.id, refine);
    return x.id;
  }, [runBrief]);

  // "Not this": drop a pin from the exploration (and keep it out of later
  // rounds), with an Undo that puts it back where it was.
  const hidePin = useCallback((xid, pin) => {
    const x = xRef.current.find((e) => e.id === xid);
    const at = x ? x.pins.findIndex((p) => p.id === pin.id) : -1;
    if (at < 0) return;
    updateX(xid, (cur) => ({ ...cur, pins: cur.pins.filter((p) => p.id !== pin.id), hidden: [...new Set([...(cur.hidden || []), pin.id])] }));
    showToast("Removed from the board", {
      label: "Undo",
      run: () => updateX(xid, (cur) => {
        const pins = cur.pins.filter((p) => p.id !== pin.id);
        pins.splice(Math.min(at, pins.length), 0, pin);
        return { ...cur, pins, hidden: (cur.hidden || []).filter((id) => id !== pin.id) };
      }),
    });
  }, [updateX, showToast]);

  // ── Boards ─────────────────────────────────────────────────────────────
  const savedIds = useMemo(() => new Set(boards.flatMap((b) => b.pins.map((p) => p.id))), [boards]);
  // Pins saved to boards carry a snapshot of their story (name + keywords), so
  // approvals and "more like this" still work after the exploration is gone.
  const strip = (pin) => {
    const { fromLibrary, round, ...rest } = pin;
    const story = xRef.current.find((e) => e.id === pin.explorationId)?.brief?.stories?.find((st) => st.id === pin.storyId);
    return story ? { ...rest, storyName: story.name, storyKeywords: story.keywords || [] } : rest;
  };
  const openPicker = useCallback((pin, anchor) => setPicker({ pin, anchor }), []);
  const closePicker = useCallback(() => setPicker(null), []);

  const addToBoard = useCallback((boardId, pin) => {
    updateBoards((list) => list.map((x) => (x.id === boardId && !x.pins.some((p) => p.id === pin.id) ? { ...x, pins: [strip(pin), ...x.pins], updatedAt: now() } : x)), [boardId]);
    writeLastBoard(boardId);
  }, [updateBoards]);
  // In the picker, each board is a checkbox: tick to add, untick to remove.
  const toggleInBoard = useCallback((boardId, pin) => {
    const b = bRef.current.find((x) => x.id === boardId);
    if (!b) return;
    if (b.pins.some((p) => p.id === pin.id)) {
      updateBoards((list) => list.map((x) => (x.id === boardId ? { ...x, pins: x.pins.filter((p) => p.id !== pin.id), updatedAt: now() } : x)), [boardId]);
    } else {
      addToBoard(boardId, pin);
    }
  }, [updateBoards, addToBoard]);
  const createBoard = useCallback((name, pins = []) => {
    const b = { id: uid(), name, pins: pins.map(strip), createdAt: now(), updatedAt: now() };
    updateBoards((list) => [b, ...list], [b.id]);
    if (pins.length) writeLastBoard(b.id);
    return b;
  }, [updateBoards]);
  // Pinterest-style Save: one click to the board you last saved to; the
  // first save (or the caret) opens the picker.
  const quickSave = useCallback((pin, anchor) => {
    const last = bRef.current.find((b) => b.id === readLastBoard());
    if (!last) { openPicker(pin, anchor); return; }
    addToBoard(last.id, pin);
    showToast(`Saved to ${last.name}`, { label: "Change", run: () => openPicker(pin, null) });
  }, [addToBoard, openPicker, showToast]);

  const deleteBoard = (id) => {
    addTombstone(id);
    dirty.current.delete(id);
    updateBoards((list) => list.filter((b) => b.id !== id));
    deleteRemote(id).catch(() => {}); // the tombstone retries it on the next sync
    go("#/boards");
    showToast("Board deleted");
  };
  const deleteExploration = (id) => {
    addTombstone(id);
    setExplorations((l) => l.filter((x) => x.id !== id));
    dirty.current.delete(id);
    deleteRemote(id).catch(() => {});
    go("#/");
    showToast("Exploration deleted");
  };

  const doCopyImage = useCallback(async (pin) => {
    try {
      await copyImage(pin);
      showToast("Image copied — paste it into Figma, Miro or a deck.");
    } catch (e) {
      showToast(String(e?.message || "Couldn't copy the image — use Download."));
    }
  }, [showToast]);

  // ── Closeup + "More like this" ──────────────────────────────────────────
  const openCloseup = useCallback((pin, list, ctx) => {
    if (!closeupRef.current) { try { window.history.pushState({ moodCloseup: true }, ""); } catch {} }
    setCloseup({ pin, list: list || [pin], ctx });
  }, []);
  const closeCloseup = useCallback(() => {
    if (window.history.state?.moodCloseup) window.history.back(); // popstate closes it
    else setCloseup(null);
  }, []);

  const moreLikeThis = useCallback(async (pin, ctx) => {
    if (closeupRef.current?.pin.id !== pin.id) openCloseup(pin, [pin], ctx);
    setRelated((r) => ({ ...r, [pin.id]: { status: "loading", pins: [] } }));
    const x = xRef.current.find((e) => e.id === (pin.explorationId || ctx?.explorationId));
    const brief = x?.brief || { title: ctx?.boardName || "Board", tagline: "", concept: "", palette: [], avoid: [] };
    const base = x?.brief?.stories?.find((s) => s.id === pin.storyId) || x?.brief?.stories?.[0];
    const story = base
      ? { ...base, queries: { photo: (base.queries?.photo || []).slice(0, 2), archive: (base.queries?.archive || []).slice(0, 1) } }
      : { id: pin.storyId || "reference", name: pin.role || "Reference", narrative: pin.note || "", keywords: [], queries: { photo: [], archive: [] } };
    const words = String(pin.alt || pin.title || pin.query || pin.storyName || "").replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
    try {
      // Page 1: the closest matches are the top results; images already on
      // the board are excluded by id.
      const exclude = new Set([...(x?.pins || []).map((p) => p.id), ...(x?.hidden || []), pin.id]);
      const res = await curateStory({ brief, story, page: 1, exclude, keep: 8, extraQueries: words ? [words] : [], reference: pin });
      const pins = res.pins.map((p) => ({ ...p, explorationId: x?.id || null }));
      setRelated((r) => ({ ...r, [pin.id]: { status: "done", pins } }));
      refreshApprovals(pins.map((p) => p.id));
    } catch (e) {
      setRelated((r) => ({ ...r, [pin.id]: { status: "error", pins: [], error: explainError(e) } }));
    }
  }, [openCloseup, refreshApprovals]);

  const onApprove = useCallback(async (pin, note) => {
    const x = xRef.current.find((e) => e.id === pin.explorationId);
    const board = x?.brief ? { title: x.brief.title, stories: x.brief.stories } : { title: closeupRef.current?.ctx?.boardName || "", stories: [] };
    const story = board.stories.find((s) => s.id === pin.storyId);
    try {
      const a = await approve(pin, { note, tags: tagsFor(board, pin), story: story?.name || pin.storyName || board.title });
      setApprovals((m) => ({ ...m, [pin.id]: [a, ...(m[pin.id] || []).filter((o) => o.curatorId !== a.curatorId)] }));
      showToast("Approved — it now carries your name.");
      return true;
    } catch (e) {
      showToast(`Couldn't approve: ${e.message || e}`);
      return false;
    }
  }, [showToast]);
  const onRevoke = useCallback(async (pin) => {
    try {
      await revoke(pin.id);
      setApprovals((m) => {
        const left = (m[pin.id] || []).filter((o) => o.curatorId !== curator?.user_id);
        const next = { ...m };
        if (left.length) next[pin.id] = left; else delete next[pin.id];
        return next;
      });
      showToast("Approval withdrawn.");
    } catch (e) {
      showToast(`Couldn't withdraw: ${e.message || e}`);
    }
  }, [curator, showToast]);

  // ── Export ─────────────────────────────────────────────────────────────
  const withApproval = (pins) => pins.map((p) => { const a = approvalOf(approvals, p); return a ? { ...p, approval: a } : p; });
  const doZip = async (name, brief, pins) => {
    if (!pins.length) { showToast("Nothing to export yet."); return; }
    setZipProgress(`0/${pins.length}`);
    try {
      const { missing } = await exportZip({ name, brief, pins: withApproval(pins), onProgress: (d, n) => setZipProgress(`${d}/${n}`) });
      showToast(missing ? `Downloaded — ${missing} image(s) couldn't be fetched (listed in MISSING.txt).` : "Downloaded.");
    } catch (e) {
      showToast(`Export failed: ${e.message || e}`);
    } finally {
      setZipProgress("");
    }
  };
  const doPrint = (name, brief, pins) => {
    if (!pins.length) { showToast("Nothing to print yet."); return; }
    setPrinting({ name, brief, pins: withApproval(pins) });
  };
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);
  const onPrintReady = useCallback(() => { window.print(); }, []);

  const doReview = async (snapshot, message) => {
    setDialog((d) => ({ ...d, busy: true }));
    try {
      await requestReview(snapshot, message);
      setDialog((d) => ({ ...d, busy: false, done: true }));
    } catch (e) {
      setDialog(null);
      showToast(`Couldn't send: ${e.message || e}`);
    }
  };

  // ── Views ──────────────────────────────────────────────────────────────
  const tileProps = (list, ctx) => ({
    onOpen: (p) => openCloseup(p, list, ctx),
    onSave: quickSave,
    onPick: openPicker,
    onDownload: (p) => downloadPin(p),
    onCopy: doCopyImage,
    onMore: (p) => moreLikeThis(p, ctx),
    onMeasure: measurePin,
  });

  let view = null;
  if (route.name === "home") {
    view = (
      <>
        <section className="hero">
          <p className="hero-kicker">Seasonal creative direction → a curated mood board</p>
          <h1 className="hero-title">Direct the<br />season.</h1>
          <p className="hero-sub">Brief it like you'd brief your team. Scout Mood's creative director adds the macro view — the consumer shift, the stories, the palette, the product language — then searches photography and museum archives and culls every candidate to a design-director standard.</p>
        </section>
        <Composer busy={false} onSubmit={(input) => startExploration(input)} />
        {explorations.length > 0 && (
          <>
            <div className="section-head"><h2 className="section-title">Recent boards</h2><a className="btn btn-quiet btn-sm" href="#/boards">See all</a></div>
            <ExplorationCovers explorations={explorations.slice(0, 8)} />
          </>
        )}
        <div className="section-head"><h2 className="section-title">How curation works</h2></div>
        <div className="how">
          <div className="how-step"><b>01</b><p><strong>The brief.</strong> An AI creative director turns your direction into a point of view: the consumer shift and its drivers, three stories (anchor, directional, edge), a named palette, materials, silhouettes, details and the clichés to avoid.</p></div>
          <div className="how-step"><b>02</b><p><strong>The search.</strong> Each story searches real photography (Unsplash, Pexels, Wikimedia Commons' juried pictures) and open-access museum collections. Every image keeps its credit, license and source link.</p></div>
          <div className="how-step"><b>03</b><p><strong>The cull.</strong> A vision pass scores every candidate like a design director would — brief fit, specificity, material, palette, craft, originality — and rejects stock clichés, logos and watermarks. Roughly one in four survives.</p></div>
          <div className="how-step"><b>04</b><p><strong>Designer approval.</strong> Verified designer-curators review boards and approve images into a shared library. Approved images carry the curator's name and lead future boards. Everything else is clearly labelled AI-curated.</p></div>
        </div>
      </>
    );
  } else if (route.name === "exploration") {
    const x = explorations.find((e) => e.id === route.id);
    view = x
      ? <ExplorationView
          key={x.id} x={x} st={status[x.id] || {}} approvals={approvals} savedIds={savedIds} libraryOn={libraryEnabled}
          tileProps={tileProps} zipProgress={zipProgress}
          onLoad={() => refreshApprovals(x.pins.map((p) => p.id))}
          onRetryBrief={() => runBrief(x.id, x.refineBase || (x.refinedWith && x.parentId ? { brief: explorations.find((e) => e.id === x.parentId)?.brief, instruction: x.refinedWith } : undefined))}
          onRetryStory={(sid) => runStory(x.id, x.brief.stories.find((s) => s.id === sid), ((x.pages || {})[sid] || 0) + 1, Math.max(1, ...x.pins.map((p) => p.round || 1)))}
          onResume={() => runRound(x.id, x.brief.stories.filter((s) => !(x.pages || {})[s.id]).map((s) => s.id))}
          onMore={(storyIds) => runRound(x.id, storyIds)}
          onHide={(p) => hidePin(x.id, p)}
          broken={broken}
          onBroken={markBroken}
          onRefine={() => setDialog({ type: "refine", x })}
          onSaveAll={(pins) => { const b = createBoard(x.brief?.title || "Board", pins); showToast(`Saved ${pins.length} images to “${b.name}”`); }}
          onZip={(pins) => doZip(x.brief?.title || "scout-mood", x.brief, pins)}
          onPrint={(pins) => doPrint(x.brief?.title || "Board", x.brief, pins)}
          onCopy={async () => showToast((await copyText(briefMarkdown(x.brief, withApproval(x.pins)))) ? "Brief copied." : "Couldn't copy.")}
          onCopyHex={async (c) => showToast((await copyText(c.hex)) ? `Copied ${c.name} ${c.hex}` : c.hex)}
          onReview={(pins) => setDialog({ type: "review", count: Math.min(pins.length, REVIEW_LIMIT), snapshot: { title: x.brief?.title, season: x.brief?.season, concept: x.brief?.concept, stories: (x.brief?.stories || []).map(({ id, name, keywords }) => ({ id, name, keywords })), pins: pins.slice(0, REVIEW_LIMIT).map(strip) } })}
          onDelete={() => deleteExploration(x.id)}
        />
      : <div className="empty"><h3>Board not found</h3><p>It may have been deleted, or it lives on another device.</p><a className="btn btn-primary" href="#/">Start a new board</a></div>;
  } else if (route.name === "boards") {
    view = (
      <>
        <div className="board-head"><h1 className="board-title" style={{ fontSize: "clamp(2.8rem, 9vw, 7rem)" }}>Boards</h1></div>
        {boards.length ? <BoardCovers boards={boards} /> : <div className="empty"><h3>No boards yet</h3><p>Hit Save on any image to start one — your final selection for the season lives here.</p></div>}
        {explorations.length > 0 && (
          <>
            <div className="section-head"><h2 className="section-title">Explorations</h2></div>
            <ExplorationCovers explorations={explorations} />
          </>
        )}
      </>
    );
  } else if (route.name === "board") {
    const b = boards.find((x) => x.id === route.id);
    view = b
      ? <BoardView
          key={b.id} b={b} approvals={approvals} savedIds={savedIds} libraryOn={libraryEnabled} zipProgress={zipProgress} broken={broken} onBroken={markBroken}
          tileProps={(list) => tileProps(list, { boardName: b.name })}
          onLoad={() => refreshApprovals(b.pins.map((p) => p.id))}
          onRemove={(p) => updateBoards((list) => list.map((x) => (x.id === b.id ? { ...x, pins: x.pins.filter((q) => q.id !== p.id), updatedAt: now() } : x)), [b.id])}
          onRename={() => setDialog({ type: "rename", b })}
          onDelete={() => deleteBoard(b.id)}
          onZip={() => doZip(b.name, null, b.pins)}
          onPrint={() => doPrint(b.name, null, b.pins)}
          onCopy={async () => showToast((await copyText(`# ${b.name}\n\n${creditsText(withApproval(b.pins))}\n`)) ? "Credits copied." : "Couldn't copy.")}
          onReview={() => setDialog({ type: "review", count: Math.min(b.pins.length, REVIEW_LIMIT), snapshot: { title: b.name, season: "", concept: "", stories: [], pins: b.pins.slice(0, REVIEW_LIMIT) } })}
        />
      : <div className="empty"><h3>Board not found</h3><a className="btn btn-primary" href="#/boards">All boards</a></div>;
  } else if (route.name === "curate") {
    view = <CuratorStudio enabled={libraryEnabled} signedIn={Boolean(session)} curator={curator} onSignIn={signIn} toast={showToast} />;
  }

  // Closeup resolution
  const cu = closeup;
  const cuIndex = cu ? cu.list.findIndex((p) => p.id === cu.pin.id) : -1;
  const cuX = cu ? explorations.find((e) => e.id === cu.pin.explorationId) : null;
  const cuStory = cuX?.brief?.stories?.find((s) => s.id === cu?.pin.storyId);

  return (
    <div className="mood">
      <div className="mood-screen">
        <div className="mood-wrap">
          <Header route={route} boardsCount={boards.length} session={session} onSignIn={signIn} onSignOut={signOut} showCurate={libraryEnabled} />
          <main>{view}</main>
          <footer className="footer-note">
            <span>Scout Mood · AI-curated images are labelled as such; the Approved badge appears only on images signed off by verified designer-curators.</span>
            <span>Photos via <a href="https://unsplash.com/?utm_source=scout_mood&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a>, <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">Photos provided by Pexels</a> and <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> · Open-access museum collections · Powered by Anthropic</span>
          </footer>
        </div>
      </div>

      {cu && (
        <Closeup
          pin={cu.pin}
          index={cuIndex}
          total={cu.list.length}
          story={cuStory}
          approvals={(approvals[cu.pin.id] || []).filter((a) => !a.base || a.base === imageBase(cu.pin.thumb))}
          approvalsMap={approvals}
          curator={curator}
          libraryEnabled={libraryEnabled}
          signedIn={Boolean(session)}
          saved={savedIds.has(cu.pin.id)}
          savedIds={savedIds}
          related={related[cu.pin.id]}
          onClose={closeCloseup}
          onPrev={cuIndex > 0 ? () => setCloseup({ ...cu, pin: cu.list[cuIndex - 1] }) : null}
          onNext={cuIndex >= 0 && cuIndex < cu.list.length - 1 ? () => setCloseup({ ...cu, pin: cu.list[cuIndex + 1] }) : null}
          onSave={quickSave}
          onPick={openPicker}
          onDownload={(p) => downloadPin(p)}
          onCopy={doCopyImage}
          onMore={(p) => moreLikeThis(p, cu.ctx)}
          onOpen={(p) => setCloseup({ pin: p, list: related[cu.pin.id]?.pins || [p], ctx: cu.ctx })}
          onApprove={onApprove}
          onRevoke={onRevoke}
          onSignIn={signIn}
          onMeasure={measurePin}
          onBroken={markBroken}
        />
      )}

      {picker && (
        <BoardPicker
          anchor={picker.anchor}
          pin={picker.pin}
          boards={boards}
          onToggle={toggleInBoard}
          onCreate={(name, pin) => { const b = createBoard(name, [pin]); showToast(`Saved to ${b.name}`); }}
          onClose={closePicker}
        />
      )}

      {dialog?.type === "refine" && (
        <RefineDialog
          busy={false}
          onClose={() => setDialog(null)}
          onSubmit={(instruction) => { const x = dialog.x; setDialog(null); startExploration(x.input, { parent: x, refine: { brief: x.brief, instruction } }); }}
        />
      )}
      {dialog?.type === "review" && (
        <ReviewDialog
          count={dialog.count}
          enabled={libraryEnabled}
          signedIn={Boolean(session)}
          onSignIn={signIn}
          busy={dialog.busy}
          done={dialog.done}
          onSubmit={(msg) => doReview(dialog.snapshot, msg)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "rename" && (
        <RenameDialog
          name={dialog.b.name}
          onClose={() => setDialog(null)}
          onSubmit={(name) => { updateBoards((list) => list.map((x) => (x.id === dialog.b.id ? { ...x, name, updatedAt: now() } : x)), [dialog.b.id]); setDialog(null); }}
        />
      )}

      {printing && <PrintBoard name={printing.name} brief={printing.brief} pins={printing.pins} onReady={onPrintReady} />}
      {toast && (
        <div className="toast" role="status" key={toast.key}>
          <span>{toast.msg}</span>
          {toast.action && <button type="button" onClick={() => { hideToast(); toast.action.run(); }}>{toast.action.label}</button>}
        </div>
      )}
    </div>
  );
}

// ── Filters shared by the exploration and board views ────────────────────
const ROLE_LABELS = { people: "People & attitude", material: "Material", garment: "Garment & silhouette", place: "Place & light", color: "Colour", lateral: "Lateral", archive: "Archive", graphic: "Graphic" };

function useFilters(approvals) {
  const approved = (p) => Boolean(approvalOf(approvals, p));
  const [role, setRole] = useState("all");
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [commercialOnly, setCommercialOnly] = useState(false);
  const pass = (p) => (role === "all" || p.role === role) && (!approvedOnly || approved(p)) && (!commercialOnly || p.license?.commercial === true);
  return { role, setRole, approvedOnly, setApprovedOnly, commercialOnly, setCommercialOnly, pass };
}

function FilterTools({ f, pins, libraryOn }) {
  const roles = [...new Set(pins.map((p) => p.role).filter(Boolean))];
  return (
    <div className="bar-tools">
      {roles.length > 1 && (
        <select className="filter-select" value={f.role} onChange={(e) => f.setRole(e.target.value)} aria-label="Filter by image role">
          <option value="all">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
        </select>
      )}
      {pins.some((p) => p.license?.commercial !== true) && (
        <label className="switch"><input type="checkbox" checked={f.commercialOnly} onChange={(e) => f.setCommercialOnly(e.target.checked)} /> Commercial-use only</label>
      )}
      {libraryOn && (
        <label className="switch"><input type="checkbox" checked={f.approvedOnly} onChange={(e) => f.setApprovedOnly(e.target.checked)} /> <BadgeCheck size={15} aria-hidden="true" /> Approved only</label>
      )}
    </div>
  );
}

// ── Exploration (a generated board) ──────────────────────────────────────
function ExplorationView({ x, st, approvals, savedIds, libraryOn, tileProps, zipProgress, broken, onLoad, onRetryBrief, onRetryStory, onResume, onMore, onHide, onBroken, onRefine, onSaveAll, onZip, onPrint, onCopy, onCopyHex, onReview, onDelete }) {
  const [story, setStory] = useState("all");
  const f = useFilters(approvals);
  const brief = x.brief;
  const briefSt = st.brief;
  const stories = brief?.stories || [];
  const shownStories = story === "all" ? stories : stories.filter((s) => s.id === story);
  // One section per story; the closeup steps through them in this order.
  const sections = useMemo(
    () => shownStories.map((s) => ({ story: s, pins: storyPins(x.pins, s.id).filter((p) => !broken.has(p.id) && f.pass(p)) })),
    [x.pins, shownStories, f.role, f.approvedOnly, f.commercialOnly, approvals, broken], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const visible = sections.flatMap((s) => s.pins);
  const busy = (s) => ["searching", "curating"].includes(st[s.id]?.phase);
  const anyBusy = stories.some(busy);
  const errors = stories.filter((s) => st[s.id]?.phase === "error");
  const unstarted = brief && !anyBusy && stories.some((s) => !(x.pages || {})[s.id] && !st[s.id]);
  const props = tileProps(visible, { explorationId: x.id });

  // Pins restored from storage: ask once on open whether any are now approved.
  useEffect(() => { onLoad(); }, [x.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!brief) {
    return (
      <div>
        <div className="board-head">
          <div className="board-season"><span className="pill">{x.input?.season}</span><span>{(x.input?.categories || []).join(" · ")}</span></div>
          <h1 className="board-title">{briefSt?.phase === "error" ? "Not this time." : "Writing the brief…"}</h1>
          <p className="board-tagline">{x.input?.direction}</p>
        </div>
        {briefSt?.phase === "error" ? (
          <div className="notice err">{briefSt.error}<div><button type="button" className="btn btn-primary btn-sm" onClick={onRetryBrief}><RefreshCw size={14} aria-hidden="true" />Try again</button></div></div>
        ) : briefSt?.phase === "writing" ? (
          <p className="status-line" aria-live="polite"><span><span className="dot" />The creative director is reading your direction, sizing up the macro view and writing the stories…</span></p>
        ) : (
          <div className="notice">This board didn't finish.<div><button type="button" className="btn btn-primary btn-sm" onClick={onRetryBrief}>Finish it</button></div></div>
        )}
        <Masonry items={Array.from({ length: 12 }, (_, i) => i)} getKey={(i) => `s${i}`} getRatio={(i) => SKELETON_RATIOS[i % 4]} renderItem={() => <SkeletonTile />} label="Loading" />
      </div>
    );
  }

  return (
    <div>
      <div className="board-head">
        <div className="board-season">
          <span className="pill">{brief.season}</span>
          {(x.input?.categories || []).length > 0 && <span>{x.input.categories.join(" · ")}</span>}
          {x.refinedWith && <span title={x.refinedWith}>· refined</span>}
        </div>
        <h1 className="board-title">{brief.title}</h1>
        {brief.tagline && <p className="board-tagline">{brief.tagline}</p>}
        <div className="board-actions">
          <button type="button" className="btn btn-primary" onClick={() => onSaveAll(visible)} disabled={!visible.length}>Save as board</button>
          <ExportMenu zipProgress={zipProgress} onZip={() => onZip(visible)} onPrint={() => onPrint(visible)} onCopy={onCopy} />
          <button type="button" className="btn btn-ghost" onClick={onRefine}><Wand2 size={16} aria-hidden="true" />Refine</button>
          <button type="button" className="btn btn-ghost" onClick={() => onReview(visible)} disabled={!visible.length}><Send size={15} aria-hidden="true" />Request designer review</button>
        </div>
      </div>

      <BriefPanel brief={brief} onCopyHex={onCopyHex} />

      <div className="story-bar">
        <div className="chip-scroll" role="group" aria-label="Filter by story">
          <button type="button" className="chip" aria-pressed={story === "all"} onClick={() => setStory("all")}>All <span className="n">{x.pins.length}</span></button>
          {stories.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={story === s.id} onClick={() => setStory(s.id)}>
              {s.name} <span className="n">{x.pins.filter((p) => p.storyId === s.id).length}</span>
            </button>
          ))}
        </div>
        <FilterTools f={f} pins={x.pins} libraryOn={libraryOn} />
      </div>

      <SourceNotice sources={x.sources} />
      {errors.length > 0 && (
        <div className="notice err">
          {errors.map((s) => `${s.name}: ${st[s.id].error}`).join(" ")}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{errors.map((s) => <button key={s.id} type="button" className="btn btn-ghost btn-sm" onClick={() => onRetryStory(s.id)}><RefreshCw size={14} aria-hidden="true" />Retry {s.name}</button>)}</div>
        </div>
      )}
      {unstarted && <div className="notice">Some stories haven't been curated yet.<div><button type="button" className="btn btn-primary btn-sm" onClick={onResume}>Curate them now</button></div></div>}

      {sections.map(({ story: s, pins }) => {
        const sst = st[s.id];
        const skeletons = busy(s) ? 4 : 0;
        const filteredOut = !pins.length && x.pins.some((p) => p.storyId === s.id);
        return (
          <section key={s.id} className="story-section" aria-labelledby={`story-${s.id}`}>
            <div className="story-head">
              <h2 id={`story-${s.id}`}>{s.role && <span className="story-role">{s.role}</span>}{s.name}</h2>
              <span className="n">{pins.length} image{pins.length === 1 ? "" : "s"}</span>
              {sst && <span className={`status-line inline${sst.phase === "error" ? " err" : ""}`} aria-live="polite">{busy(s) && <span className="dot" />}{phaseText(sst)}</span>}
            </div>
            <p className="story-desc">{s.narrative}</p>
            {pins.length || skeletons ? (
              <Masonry
                label={`${s.name} — ${pins.length} images`}
                items={[...pins, ...Array.from({ length: skeletons }, (_, i) => ({ skeleton: true, id: `sk-${s.id}-${i}`, i }))]}
                getKey={(p) => p.id}
                getRatio={(p) => (p.skeleton ? SKELETON_RATIOS[p.i % 4] : ratioOf(p))}
                renderItem={(p) => (p.skeleton
                  ? <SkeletonTile />
                  : <Tile pin={p} approved={approvalOf(approvals, p)} saved={savedIds.has(p.id)} {...props} onHide={onHide} onBroken={onBroken} />)}
              />
            ) : (
              <p className="story-empty">
                {filteredOut ? "Nothing in this story matches the filters." : sst?.phase === "error" ? "This story didn't finish — retry above." : "Nothing cleared the bar for this story yet."}
              </p>
            )}
            {!(x.exhausted || {})[s.id] && (
              <div className="more-row" style={{ justifyContent: "flex-start", marginTop: 14 }}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy(s)} onClick={() => onMore([s.id])}>{busy(s) ? "Curating…" : `More for ${s.name}`}</button>
              </div>
            )}
          </section>
        );
      })}

      <div className="more-row" style={{ gap: 10, flexWrap: "wrap" }}>
        {stories.some((s) => !(x.exhausted || {})[s.id]) && story === "all" && (
          <button type="button" className="btn btn-dark" disabled={anyBusy} onClick={() => onMore(undefined)}>{anyBusy ? "Curating…" : "More for every story"}</button>
        )}
      </div>
      <div className="more-row"><button type="button" className="btn btn-quiet btn-sm" onClick={() => { if (window.confirm("Delete this exploration? Boards you saved images to are kept.")) onDelete(); }}><Trash2 size={14} aria-hidden="true" />Delete exploration</button></div>
    </div>
  );
}

// ── Saved board ───────────────────────────────────────────────────────────
function BoardView({ b, approvals, savedIds, libraryOn, zipProgress, broken, onBroken, tileProps, onLoad, onRemove, onRename, onDelete, onZip, onPrint, onCopy, onReview }) {
  const f = useFilters(approvals);
  useEffect(() => { onLoad(); }, [b.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = b.pins.filter((p) => !broken.has(p.id) && f.pass(p));
  const props = tileProps(visible);
  return (
    <div>
      <div className="board-head">
        <div className="board-season"><span>{b.pins.length} pin{b.pins.length === 1 ? "" : "s"}</span></div>
        <h1 className="board-title">{b.name}</h1>
        <div className="board-actions">
          <ExportMenu zipProgress={zipProgress} onZip={onZip} onPrint={onPrint} onCopy={onCopy} copyLabel="Copy credits" />
          <button type="button" className="btn btn-ghost" onClick={onReview} disabled={!b.pins.length}><Send size={15} aria-hidden="true" />Request designer review</button>
          <button type="button" className="btn btn-ghost" onClick={onRename}><Pencil size={15} aria-hidden="true" />Rename</button>
          <button type="button" className="btn btn-quiet" onClick={() => { if (window.confirm(`Delete “${b.name}”?`)) onDelete(); }}><Trash2 size={15} aria-hidden="true" />Delete</button>
        </div>
      </div>
      {b.pins.length > 0 && <div className="story-bar"><span /><FilterTools f={f} pins={b.pins} libraryOn={libraryOn} /></div>}
      {visible.length ? (
        <Masonry
          label={`${b.name} — ${visible.length} images`}
          items={visible}
          getKey={(p) => p.id}
          getRatio={ratioOf}
          renderItem={(p) => (
            <div className="board-pin">
              <Tile pin={p} approved={approvalOf(approvals, p)} saved={savedIds.has(p.id)} {...props} onHide={onRemove} onBroken={onBroken} />
            </div>
          )}
        />
      ) : (
        <div className="empty"><h3>{b.pins.length ? "Nothing here matches the filters" : "This board is empty"}</h3><p>Save images from any exploration to fill it.</p><a className="btn btn-primary" href="#/">Start a new board</a></div>
      )}
    </div>
  );
}
