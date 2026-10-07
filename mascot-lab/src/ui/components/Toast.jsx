import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cx } from "./cx.js";
import { currentRoute } from "./router.js";
import "./components.css";

const ToastContext = createContext(null);
const ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertCircle };
let seq = 0;

/**
 * <ToastProvider> + useToast():
 *   const { toast, dismiss } = useToast();
 *   toast({ title: "Saved", body: "…", tone: "success", action: { label: "Undo", onClick }, duration: 5000 });
 *   toast("Plain message");
 * tone: "info" | "success" | "warning" | "danger"; duration 0 = stays until closed.
 * A route change (#order → #review …) dismisses the toasts raised on the page being left,
 * except sticky ones (`sticky: true` or duration 0). A toast raised right before a
 * navigate() in the same handler ("Order reopened", then go to #order) belongs to the
 * page being opened: navigate() updates location.hash synchronously, so a microtask
 * after toast() sees the destination and the toast adopts it.
 */
export function ToastProvider({ children, max = 4 }) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const routes = useRef(new Map()); // toast id → the route it belongs to
  const dismiss = useCallback((id) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setItems((list) => list.filter((t) => !(t.id === id && t.leaving)));
      // (unless a new toast reused the id meanwhile)
      if (!itemsRef.current.some((t) => t.id === id && !t.leaving)) routes.current.delete(id);
    }, 180);
  }, []);
  const toast = useCallback((opts) => {
    const o = typeof opts === "string" ? { title: opts } : opts || {};
    const id = o.id || `t${++seq}`;
    const tone = o.tone || "info";
    const duration = o.duration ?? (tone === "danger" ? 9000 : 4800);
    routes.current.set(id, currentRoute());
    queueMicrotask(() => { if (routes.current.has(id)) routes.current.set(id, currentRoute()); });
    setItems((list) => [...list.filter((t) => t.id !== id), { ...o, id, tone, duration }].slice(-max));
    return id;
  }, [max]);
  // toasts belong to the page they were raised on
  useEffect(() => {
    const onHash = () => {
      const route = currentRoute();
      for (const t of itemsRef.current) {
        if (t.leaving || t.sticky || t.duration === 0) continue;
        const own = routes.current.get(t.id);
        if (own && own !== route) dismiss(t.id);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [dismiss]);
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
      <span className="ml-toast__icon" aria-hidden="true">{React.createElement(ICON[t.tone] || Info)}</span>
      <div className="ml-toast__main">
        {t.kicker && <span className="ml-toast__kicker">{t.kicker}</span>}
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
