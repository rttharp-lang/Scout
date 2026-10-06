// PasteRoster — a Sheet: paste "Name, Number, Size[, Bottom size]" lines or cells
// copied from a spreadsheet, see exactly what was understood, then replace the roster
// or add to it.
import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button, Segmented, Sheet, SpecLabel, Textarea, cx } from "../components/index.js";
import { isValidNumber, parseRoster, parsedToRows } from "./roster.js";
import { plural } from "./util.js";

const PLACEHOLDER = `Jamal Carter, 23, L
Kai Brooks, 5, M, S
Devin Okafor, 00, 2XL, XL`;

export function PasteRoster({ open, onClose, onApply, roster, garmentIds }) {
  const [text, setText] = useState("");
  const onlyExamples = roster.length === 0 || roster.every((r) => r.example);
  const [mode, setMode] = useState(null); // null → default by roster
  const taRef = useRef(null);
  const parsed = useMemo(() => parseRoster(text), [text]);
  const effMode = mode || (onlyExamples ? "replace" : "append");
  const n = parsed.rows.length;
  const withIssues = parsed.rows.filter((r) => r.issues.length).length;
  const noSize = parsed.rows.filter((r) => !r.top).length;

  const apply = () => {
    if (!n) return;
    onApply(parsedToRows(parsed.rows, garmentIds), effMode);
    setText("");
    setMode(null);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      kicker="Roster"
      title="Paste your roster"
      width={600}
      initialFocusRef={taRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={apply} disabled={!n} icon={<Check aria-hidden="true" />}>
            {n ? (effMode === "replace" ? `Replace with ${plural(n, "player")}` : `Add ${plural(n, "player")}`) : "Paste players first"}
          </Button>
        </>
      }
    >
      <p>One player per line: <strong>name, number, size</strong>, and a bottom size if it differs. Copy straight from Google Sheets or Excel; a header row is fine and the column order doesn't matter when it's there.</p>
      <Textarea
        ref={taRef}
        className="ord-paste__ta"
        rows={8}
        value={text}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        aria-label="Roster text"
        onChange={(e) => setText(e.target.value)}
      />
      {roster.length > 0 && (
        <div className="ord-paste__mode">
          <Segmented
            label="What to do with the current roster"
            size="sm"
            value={effMode}
            onChange={setMode}
            options={[
              { value: "replace", label: onlyExamples ? "Replace the examples" : `Replace all ${roster.length}` },
              { value: "append", label: "Add to the roster" },
            ]}
          />
        </div>
      )}
      {text.trim() && (
        <div className="ord-paste__preview" aria-live="polite">
          <div className="ord-paste__stats">
            <SpecLabel variant={n ? "success" : "warning"}>{n ? `${plural(n, "player")} found` : "No players found"}</SpecLabel>
            {parsed.header && <SpecLabel>Header: {parsed.header.filter(Boolean).join(" · ")}</SpecLabel>}
            {noSize > 0 && <SpecLabel variant="warning">{plural(noSize, "player")} without a size</SpecLabel>}
            {withIssues > 0 && <SpecLabel variant="warning">{plural(withIssues, "line")} to check</SpecLabel>}
            {parsed.skipped > 0 && <SpecLabel>{plural(parsed.skipped, "line")} skipped</SpecLabel>}
          </div>
          {n > 0 && (
            <div className="ord-paste__tablewrap">
              <table className="ord-paste__table">
                <thead>
                  <tr><th>No.</th><th>Name</th><th>Top</th><th>Bottom</th></tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 60).map((r, i) => (
                    <React.Fragment key={i}>
                      <tr className={cx(r.issues.length && "has-issue")}>
                        <td className={cx("num", r.number && !isValidNumber(r.number) && "bad")}>{r.number || "–"}</td>
                        <td>{r.name || <span className="muted">No name</span>}</td>
                        <td className={cx(!r.top && "missing")}>{r.top || "–"}</td>
                        <td className={cx(!r.bottom && "missing", r.bottomFromTop && "muted")} title={r.bottomFromTop ? "Same as top" : undefined}>{r.bottom || "–"}</td>
                      </tr>
                      {r.issues.length > 0 && (
                        <tr className="ord-paste__issue">
                          <td colSpan={4}><AlertTriangle aria-hidden="true" /> {r.issues.join(" · ")} <span className="muted">in “{r.raw}”</span></td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {n > 60 && <p className="muted small">…and {n - 60} more.</p>}
            </div>
          )}
          {n > 0 && <p className="small muted">Every pasted player gets every garment in the kit; untick pieces per player in the roster afterwards.</p>}
        </div>
      )}
    </Sheet>
  );
}

export default PasteRoster;
