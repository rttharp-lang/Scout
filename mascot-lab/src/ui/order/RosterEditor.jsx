// RosterEditor — the players: name, number, top size, bottom size and which garments
// each player gets. A keyboard-first grid on desktop (Enter / ↑ / ↓ move between rows
// like a spreadsheet, Enter on the last row adds a player); compact cards on phones.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDownUp, ChevronDown, ClipboardPaste, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Button, Chip, ChipRow, IconButton, SpecLabel, cx, useConfirm, useToast } from "../components/index.js";
import { PRODUCTS, SIZE_GROUPS } from "../../order/catalog.js";
import { isBlankRow, rowIncludes } from "../../order/pricing.js";
import { blankRow, cleanNumber, sortRoster } from "./roster.js";
import { plural, shortName, useMedia } from "./util.js";

const strip = (r) => {
  if (!r.example) return r;
  const { example, ...rest } = r;
  return rest;
};

function SizeSelect({ value, onChange, label, missing, disabled, className, ...rest }) {
  return (
    <select
      className={cx("ord-size", !value && "is-empty", missing && "is-missing", className)}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      disabled={disabled}
      title={missing ? "Pick a size" : undefined}
      {...rest}
    >
      <option value="">{disabled ? "–" : "Size"}</option>
      {SIZE_GROUPS.map((g) => (
        <optgroup key={g.id} label={g.label}>
          {g.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function AllCheckbox({ checked, indeterminate, onChange, label, disabled }) {
  const ref = useRef(null);
  useLayoutEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} disabled={disabled} />;
}

const NUMBER_HINT = { invalid: "Use 0–99 or 00", duplicate: "Number used twice", missing: "No number yet" };

export function RosterEditor({ roster, setRoster, ids, issues, locked = false, onPaste, numbersMatter = true }) {
  const compact = useMedia("(max-width: 720px)");
  const confirm = useConfirm();
  const { toast } = useToast();
  const wrapRef = useRef(null);
  const [focus, setFocus] = useState(null); // { id, col }
  const [openPieces, setOpenPieces] = useState({}); // phone: rowId → garment chips shown
  const fits = {
    top: ids.some((id) => PRODUCTS[id]?.fit === "top"),
    bottom: ids.some((id) => PRODUCTS[id]?.fit === "bottom"),
  };
  const cols = ["name", "number", ...(fits.top ? ["top"] : []), ...(fits.bottom ? ["bottom"] : []), ...ids.map((g) => `g:${g}`)];
  const examples = roster.filter((r) => r.example).length;
  const counted = roster.filter((r) => !isBlankRow(r));

  useEffect(() => {
    if (!focus) return;
    const el = wrapRef.current?.querySelector(`[data-id="${focus.id}"][data-c="${focus.col}"]`);
    if (el) { el.focus(); if (el.select && el.type === "text") el.select(); }
    setFocus(null);
  }, [focus, roster]);

  const update = (id, patch) => setRoster((rows) => rows.map((r) => (r.id === id ? strip({ ...r, ...patch }) : r)));
  const setItem = (row, g, on) => setRoster((rows) => rows.map((r) => (r.id === row.id ? { ...r, items: { ...(r.items || {}), [g]: on } } : r)));
  const addRow = (col = "name") => {
    const row = blankRow(ids);
    setRoster((rows) => [...rows, row]);
    setFocus({ id: row.id, col });
  };
  const removeRow = (row, index) => {
    setRoster((rows) => rows.filter((r) => r.id !== row.id));
    toast({
      title: `Removed ${row.name?.trim() || (row.number ? `#${row.number}` : "a blank row")}`,
      action: { label: "Undo", onClick: () => setRoster((rows) => { const next = [...rows]; next.splice(Math.min(index, next.length), 0, row); return next; }) },
    });
  };
  const clearExamples = async () => {
    const ok = await confirm({
      kicker: "Roster",
      title: "Clear the example players?",
      body: `This removes the ${plural(examples, "example player")}. Anyone you added or edited stays on the roster.`,
      confirmLabel: "Clear examples",
      tone: "danger",
    });
    if (ok) {
      setRoster((rows) => rows.filter((r) => !r.example));
      toast({ title: "Example players cleared", body: "Add your players, or paste them from a spreadsheet.", tone: "success" });
    }
  };
  const setAll = (g, on) => setRoster((rows) => rows.map((r) => ({ ...r, items: { ...(r.items || {}), [g]: on } })));
  const sortByNumber = () => setRoster((rows) => sortRoster(rows));

  const focusCell = (rowIndex, col) => {
    const el = wrapRef.current?.querySelector(`[data-r="${rowIndex}"][data-c="${col}"]`);
    if (el) { el.focus(); if (el.select && el.type === "text") el.select(); }
  };
  const onGridKey = (e) => {
    const el = e.target;
    const r = Number(el.dataset?.r);
    const c = el.dataset?.c;
    if (!Number.isFinite(r) || !c) return;
    const isText = el.tagName === "INPUT" && el.type === "text";
    const isCheck = el.tagName === "INPUT" && el.type === "checkbox";
    if (isCheck && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      const ci = cols.indexOf(c) + (e.key === "ArrowRight" ? 1 : -1);
      if (ci >= 0 && ci < cols.length) focusCell(r, cols[ci]);
      return;
    }
    let dr = 0;
    if ((isText || isCheck) && e.key === "ArrowDown") dr = 1;
    else if ((isText || isCheck) && e.key === "ArrowUp") dr = -1;
    else if (isText && e.key === "Enter") dr = e.shiftKey ? -1 : 1;
    else return;
    e.preventDefault();
    const t = r + dr;
    if (t >= roster.length) { if (e.key === "Enter" && !locked) addRow(c); return; }
    if (t >= 0) focusCell(t, c);
  };

  const issueFor = (row) => issues?.byRow?.[row.id] || {};
  const jumpTo = (kind) => {
    const idx = roster.findIndex((r) => {
      const is = issueFor(r);
      return kind === "size" ? is.top || is.bottom : kind === "number" ? is.number === "invalid" : kind === "duplicate" ? is.number === "duplicate" : kind === "name" ? is.name : false;
    });
    if (idx < 0) return;
    const is = issueFor(roster[idx]);
    const col = kind === "size" ? (is.top ? "top" : "bottom") : kind === "name" ? "name" : "number";
    focusCell(idx, col);
  };

  const c = issues?.counts || {};
  const missingSizes = (c.missingTop || 0) + (c.missingBottom || 0);
  const dupNumbers = Object.keys(issues?.duplicates || {});

  /* ───────── toolbar + banners ───────── */
  const toolbar = !locked && (
    <div className="ord-roster__tools">
      <Button variant="secondary" size="sm" icon={<ClipboardPaste aria-hidden="true" />} onClick={onPaste} disabled={locked}>Paste roster</Button>
      {!compact && counted.length > 1 && (
        <Button variant="ghost" size="sm" icon={<ArrowDownUp aria-hidden="true" />} onClick={sortByNumber} disabled={locked}>Sort by number</Button>
      )}
    </div>
  );

  const banner = examples > 0 && !locked && (
    <div className="ord-example" role="status">
      <p><strong>Example roster.</strong> Replace these players with yours{examples < roster.length ? ` (${plural(examples, "example player")} left)` : ""}.</p>
      <Button size="sm" variant="secondary" icon={<X aria-hidden="true" />} onClick={clearExamples} disabled={locked}>Clear examples</Button>
    </div>
  );

  const issueBar = (dupNumbers.length > 0 || c.invalid > 0 || missingSizes > 0) && (
    <div className="ord-issues" aria-live="polite">
      <AlertTriangle aria-hidden="true" />
      <ChipRow label="Roster problems">
        {c.invalid > 0 && <Chip size="sm" className="ord-issue ord-issue--bad" onClick={() => jumpTo("number")}>{plural(c.invalid, "number")} not 0–99 or 00</Chip>}
        {dupNumbers.length > 0 && (
          <Chip size="sm" className="ord-issue" onClick={() => jumpTo("duplicate")}>
            {dupNumbers.length === 1 ? `#${dupNumbers[0]} is used twice` : `${dupNumbers.length} numbers used twice: ${dupNumbers.map((n) => `#${n}`).join(", ")}`}
          </Chip>
        )}
        {missingSizes > 0 && <Chip size="sm" className="ord-issue" onClick={() => jumpTo("size")}>{plural(missingSizes, "size")} still to pick</Chip>}
      </ChipRow>
    </div>
  );

  const empty = roster.length === 0 && (
    <div className="ord-empty">
      <UserPlus aria-hidden="true" />
      <div>
        <h4>No players yet</h4>
        <p>Add players one by one, or paste the whole list from a spreadsheet: name, number, size.</p>
      </div>
      <div className="cluster">
        <Button size="sm" icon={<Plus aria-hidden="true" />} onClick={() => addRow()} disabled={locked}>Add player</Button>
        <Button size="sm" variant="secondary" icon={<ClipboardPaste aria-hidden="true" />} onClick={onPaste} disabled={locked}>Paste roster</Button>
      </div>
    </div>
  );

  /* ───────── phone: cards ───────── */
  if (compact) {
    return (
      <div className="ord-roster" ref={wrapRef}>
        {toolbar}
        {banner}
        {empty}
        <ol className="ord-cards" role="list">
          {roster.map((row, i) => {
            const is = issueFor(row);
            const hasTop = ids.some((g) => PRODUCTS[g].fit === "top" && rowIncludes(row, g));
            const hasBottom = ids.some((g) => PRODUCTS[g].fit === "bottom" && rowIncludes(row, g));
            const label = row.name?.trim() || `Player ${i + 1}`;
            const included = ids.filter((g) => rowIncludes(row, g)).length;
            return (
              <li key={row.id} className={cx("ord-card", row.example && "is-example")}>
                <div className="ord-card__head">
                  <label className={cx("ord-card__num", is.number && `has-${is.number}`)}>
                    <span className="visually-hidden">{label} number</span>
                    <span aria-hidden="true" className="ord-card__hash">#</span>
                    <input
                      type="text" inputMode="numeric" maxLength={2} placeholder="00" autoComplete="off"
                      value={row.number || ""} disabled={locked}
                      data-id={row.id} data-r={i} data-c="number"
                      aria-invalid={is.number === "invalid" || undefined}
                      onChange={(e) => update(row.id, { number: cleanNumber(e.target.value) })}
                    />
                  </label>
                  <input
                    type="text" className="ord-card__name" placeholder="Player name" maxLength={40} autoComplete="off"
                    value={row.name || ""} disabled={locked} aria-label={`Player ${i + 1} name`}
                    data-id={row.id} data-r={i} data-c="name"
                    onChange={(e) => update(row.id, { name: e.target.value })}
                  />
                  {!locked && <IconButton size="sm" label={`Remove ${label}`} icon={<Trash2 aria-hidden="true" />} onClick={() => removeRow(row, i)} />}
                </div>
                {is.number && is.number !== "missing" && <p className="ord-card__warn">{NUMBER_HINT[is.number]}</p>}
                <div className="ord-card__row">
                  {fits.top && (
                    <label className={cx("ord-csel", is.top && "is-missing", (locked || !hasTop) && "is-off")}>
                      <span>Top</span>
                      <SizeSelect value={row.top} onChange={(v) => update(row.id, { top: v })} label={`${label} top size`} missing={!!is.top} disabled={locked || !hasTop} data-id={row.id} data-c="top" />
                    </label>
                  )}
                  {fits.bottom && (
                    <label className={cx("ord-csel", is.bottom && "is-missing", (locked || !hasBottom) && "is-off")}>
                      <span>Bottom</span>
                      <SizeSelect value={row.bottom} onChange={(v) => update(row.id, { bottom: v })} label={`${label} bottom size`} missing={!!is.bottom} disabled={locked || !hasBottom} data-id={row.id} data-c="bottom" />
                    </label>
                  )}
                  {ids.length > 1 && (
                    <button
                      type="button"
                      className={cx("ord-card__pieces", included < ids.length && "is-partial")}
                      aria-expanded={!!openPieces[row.id]}
                      aria-controls={`pieces-${row.id}`}
                      onClick={() => setOpenPieces((o) => ({ ...o, [row.id]: !o[row.id] }))}
                    >
                      <span className="ord-card__pk">Pieces</span>
                      <span className="visually-hidden">: </span>
                      {included === ids.length ? included : `${included}/${ids.length}`}
                      <ChevronDown aria-hidden="true" />
                    </button>
                  )}
                </div>
                {ids.length > 1 && openPieces[row.id] && (
                  <ChipRow className="ord-card__items" id={`pieces-${row.id}`} label={`Garments for ${label}`}>
                    {ids.map((g) => (
                      <Chip key={g} size="sm" selected={rowIncludes(row, g)} onClick={() => setItem(row, g, !rowIncludes(row, g))} disabled={locked}>
                        {shortName(g)}
                      </Chip>
                    ))}
                  </ChipRow>
                )}
              </li>
            );
          })}
        </ol>
        {roster.length > 0 && !locked && (
          <Button variant="secondary" block icon={<Plus aria-hidden="true" />} onClick={() => addRow()}>Add player</Button>
        )}
        {issueBar}
      </div>
    );
  }

  /* ───────── desktop / tablet: grid ───────── */
  return (
    <div className="ord-roster" ref={wrapRef}>
      {toolbar}
      {banner}
      {empty}
      {roster.length > 0 && (
        <div className="ord-grid-wrap">
          <table className="ord-grid" onKeyDown={onGridKey}>
            <caption className="visually-hidden">Roster: one row per player. Enter or the arrow keys move between rows.</caption>
            <thead>
              <tr>
                <th scope="col" className="ord-grid__idx"><span className="visually-hidden">Row</span></th>
                <th scope="col" className="ord-grid__name">Player name</th>
                <th scope="col" className="ord-grid__no">No.</th>
                {fits.top && <th scope="col" className="ord-grid__size">Top</th>}
                {fits.bottom && <th scope="col" className="ord-grid__size">Bottom</th>}
                {ids.map((g) => {
                  const on = counted.filter((r) => rowIncludes(r, g)).length;
                  return (
                    <th scope="col" key={g} className="ord-grid__g">
                      <label title={`${PRODUCTS[g].name}: everyone on or off`}>
                        <span>{shortName(g)}</span>
                        <AllCheckbox
                          checked={counted.length > 0 && on === counted.length}
                          indeterminate={on > 0 && on < counted.length}
                          onChange={(v) => setAll(g, v)}
                          label={`${PRODUCTS[g].name} for every player`}
                          disabled={locked}
                        />
                      </label>
                    </th>
                  );
                })}
                <th scope="col" className="ord-grid__del"><span className="visually-hidden">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {roster.map((row, i) => {
                const is = issueFor(row);
                const hasTop = ids.some((g) => PRODUCTS[g].fit === "top" && rowIncludes(row, g));
                const hasBottom = ids.some((g) => PRODUCTS[g].fit === "bottom" && rowIncludes(row, g));
                const label = row.name?.trim() || `Player ${i + 1}`;
                return (
                  <tr key={row.id} className={cx(row.example && "is-example", isBlankRow(row) && "is-blank")}>
                    <td className="ord-grid__idx" aria-hidden="true">{String(i + 1).padStart(2, "0")}</td>
                    <td className="ord-grid__name">
                      <input
                        type="text" placeholder="Player name" maxLength={40} autoComplete="off"
                        value={row.name || ""} disabled={locked} aria-label={`Player ${i + 1} name`}
                        data-id={row.id} data-r={i} data-c="name"
                        onChange={(e) => update(row.id, { name: e.target.value })}
                      />
                    </td>
                    <td className={cx("ord-grid__no", is.number && `has-${is.number}`)}>
                      <input
                        type="text" inputMode="numeric" maxLength={2} placeholder="–" autoComplete="off"
                        value={row.number || ""} disabled={locked} aria-label={`${label} number`}
                        aria-invalid={is.number === "invalid" || undefined}
                        title={is.number ? NUMBER_HINT[is.number] : undefined}
                        data-id={row.id} data-r={i} data-c="number"
                        onChange={(e) => update(row.id, { number: cleanNumber(e.target.value) })}
                      />
                      {(is.number === "duplicate" || is.number === "invalid") && <span className="ord-grid__flag" aria-hidden="true" />}
                    </td>
                    {fits.top && (
                      <td className="ord-grid__size">
                        <SizeSelect value={row.top} onChange={(v) => update(row.id, { top: v })} label={`${label} top size`} missing={!!is.top} disabled={locked || !hasTop} data-id={row.id} data-r={i} data-c="top" />
                      </td>
                    )}
                    {fits.bottom && (
                      <td className="ord-grid__size">
                        <SizeSelect value={row.bottom} onChange={(v) => update(row.id, { bottom: v })} label={`${label} bottom size`} missing={!!is.bottom} disabled={locked || !hasBottom} data-id={row.id} data-r={i} data-c="bottom" />
                      </td>
                    )}
                    {ids.map((g) => (
                      <td key={g} className="ord-grid__g">
                        <input
                          type="checkbox" checked={rowIncludes(row, g)} disabled={locked}
                          aria-label={`${PRODUCTS[g].name} for ${label}`}
                          data-id={row.id} data-r={i} data-c={`g:${g}`}
                          onChange={(e) => setItem(row, g, e.target.checked)}
                        />
                      </td>
                    ))}
                    <td className="ord-grid__del">
                      {!locked && <IconButton size="sm" label={`Remove ${label}`} icon={<Trash2 aria-hidden="true" />} onClick={() => removeRow(row, i)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {roster.length > 0 && !locked && (
        <div className="ord-roster__foot">
          <Button variant="ghost" size="sm" icon={<Plus aria-hidden="true" />} onClick={() => addRow()} disabled={locked}>Add player</Button>
          <span className="ord-roster__hint">
            <kbd>Enter</kbd> next row · <kbd>↑</kbd><kbd>↓</kbd> move · Enter on the last row adds a player
          </span>
        </div>
      )}
      {issueBar}
    </div>
  );
}

export default RosterEditor;
