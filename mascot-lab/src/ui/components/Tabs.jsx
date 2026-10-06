import React, { useRef } from "react";
import { cx } from "./cx.js";
import "./components.css";

export const tabId = (idBase, v) => `${idBase}-tab-${v}`;
export const panelId = (idBase, v) => `${idBase}-panel-${v}`;

/**
 * Tabs — tablist with roving tabindex and automatic activation (arrow keys, Home, End).
 * tabs: [{ id, label, count?, disabled? }]. Render the content with <TabPanel>.
 */
export function Tabs({ tabs = [], value, onChange, idBase = "tabs", label, size = "md", className }) {
  const refs = useRef([]);
  const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
  const go = (i, dir) => {
    let p = enabled.indexOf(i);
    const n = dir === "first" ? enabled[0] : dir === "last" ? enabled[enabled.length - 1] : enabled[(p + dir + enabled.length) % enabled.length];
    if (n == null) return;
    onChange?.(tabs[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cx("ml-tabs", size === "sm" && "ml-tabs--sm", className)}>
      {tabs.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="tab"
            id={tabId(idBase, t.id)}
            aria-selected={on}
            aria-controls={panelId(idBase, t.id)}
            tabIndex={on ? 0 : -1}
            disabled={t.disabled}
            className="ml-tab"
            onClick={() => onChange?.(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); go(i, 1); }
              else if (e.key === "ArrowLeft") { e.preventDefault(); go(i, -1); }
              else if (e.key === "Home") { e.preventDefault(); go(i, "first"); }
              else if (e.key === "End") { e.preventDefault(); go(i, "last"); }
            }}
          >
            <span>{t.label}</span>
            {t.count != null && <span className="ml-tab__count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** TabPanel — the content for the selected tab. */
export function TabPanel({ idBase = "tabs", value, children, className, ...rest }) {
  return (
    <div role="tabpanel" id={panelId(idBase, value)} aria-labelledby={tabId(idBase, value)} tabIndex={0} className={className} {...rest}>
      {children}
    </div>
  );
}

export default Tabs;
