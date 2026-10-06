import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cx } from "./cx.js";
import "./components.css";

const ToastContext = createContext(null);
const KICKER = { info: "Note", success: "Done", warning: "Heads up", danger: "Problem" };
let seq = 0;

/**
 * <ToastProvider> + useToast():
 *   const { toast, dismiss } = useToast();
 *   toast({ title: "Saved", body: "…", tone: "success", action: { label: "Undo", onClick }, duration: 5000 });
 *   toast("Plain message");
 * tone: "info" | "success" | "warning" | "danger"; duration 0 = stays until closed.
 */
export function ToastProvider({ children, max = 4 }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 180);
  }, []);
  const toast = useCallback((opts) => {
    const o = typeof opts === "string" ? { title: opts } : opts || {};
    const id = o.id || `t${++seq}`;
    const tone = o.tone || "info";
    const duration = o.duration ?? (tone === "danger" ? 9000 : 4800);
    setItems((list) => [...list.filter((t) => t.id !== id), { ...o, id, tone, duration }].slice(-max));
    return id;
  }, [max]);
  const api = useRef({ toast, dismiss });
  api.current.toast = toast;
  api.current.dismiss = dismiss;
  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="ml-toasts" role="region" aria-label="Notifications" aria-live="polite" aria-relevant="additions">
        {items.map((t) => <ToastItem key={t.id} t={t} onClose={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ t, onClose }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(t.duration);
  const started = useRef(0);
  useEffect(() => {
    if (!t.duration || paused || t.leaving) return;
    started.current = Date.now();
    const timer = setTimeout(onClose, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, t.leaving]);
  return (
    <div
      className={cx("ml-toast", `ml-toast--${t.tone}`, t.leaving && "is-leaving")}
      role={t.tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="ml-toast__tone" aria-hidden="true" />
      <div className="ml-toast__main">
        <span className="ml-toast__kicker">{t.kicker || KICKER[t.tone] || "Note"}</span>
        {t.title && <span className="ml-toast__title">{t.title}</span>}
        {t.body && <span className="ml-toast__body">{t.body}</span>}
      </div>
      <div className="ml-toast__side">
        {t.action && (
          <button type="button" className="ml-toast__action" onClick={() => { t.action.onClick?.(); onClose(); }}>
            {t.action.label}
          </button>
        )}
        <button type="button" className="ml-toast__close" aria-label="Dismiss notification" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used inside <ToastProvider>.");
  return ctx;
}

export default ToastProvider;
