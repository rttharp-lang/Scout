import React, { useEffect } from "react";

export const Label = ({ kind, children }) => <span className={`chip ${kind || ""}`}>{children || String(kind || "").replace(/_/g, " ")}</span>;
export const Confidence = ({ level, title }) => <span className={`chip confidence-${level || "low"}`} title={title}>confidence {level || "low"}</span>;
export const DateKind = ({ kind }) => <span className={`chip ${kind || "unknown"}`}>{kind || "unknown"}</span>;
export const Demo = ({ on }) => (on ? <span className="chip demo">demo fixture</span> : null);

export function Drawer({ open, onClose, title, children, width }) {
  useEffect(() => { if (!open) return; const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; }; }, [open, onClose]);
  if (!open) return null;
  return (<>
    <div className="drawer-backdrop" onClick={onClose} />
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={title || "Details"} style={width ? { width } : undefined}>
      <button className="btn ghost sm close" onClick={onClose} aria-label="Close">Close ✕</button>
      {title && <h2 style={{ fontSize: 24, marginBottom: 12, paddingRight: 90 }}>{title}</h2>}
      {children}
    </aside>
  </>);
}
export const Empty = ({ children }) => <div className="card flat" style={{ color: "var(--mute)", borderStyle: "dashed" }}>{children}</div>;
export const KV = ({ items }) => <dl className="kv">{items.filter(([, v]) => v != null && v !== "").map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd></React.Fragment>)}</dl>;
export const Loading = () => <div className="wrap" style={{ padding: "40px 0", color: "var(--mute)" }}>Loading…</div>;
export const ErrorBox = ({ error }) => <div className="wrap" style={{ padding: "24px 0" }}><div className="notice bad">Error: {error?.message || String(error)}</div></div>;
