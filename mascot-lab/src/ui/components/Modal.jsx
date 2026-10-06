import React, { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./IconButton.jsx";
import { Button } from "./Button.jsx";
import { SpecLabel } from "./SpecLabel.jsx";
import { cx } from "./cx.js";
import "./components.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const EXIT_MS = 170;
let openCount = 0;

function useExitTransition(open) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, EXIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return { mounted, closing };
}

/** Focus trap + Esc + scroll lock + background inert, while `active`. */
function useDialogBehaviour(active, panelRef, { onEscape, initialFocusRef }) {
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  useLayoutEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    const before = document.activeElement;
    const root = document.getElementById("root");
    const prevOverflow = document.body.style.overflow;
    openCount++;
    document.body.style.overflow = "hidden";
    if (root && !root.contains(panel)) root.setAttribute("inert", "");

    const target = initialFocusRef?.current || panel?.querySelector("[data-autofocus]") || panel;
    target?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); escRef.current?.(); return; }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) { e.preventDefault(); panel.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const onFocusIn = (e) => { if (panel && !panel.contains(e.target)) panel.focus({ preventScroll: true }); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn);
      openCount = Math.max(0, openCount - 1);
      if (!openCount) {
        document.body.style.overflow = prevOverflow === "hidden" ? "" : prevOverflow;
        root?.removeAttribute("inert");
      }
      // after React's commit (it restores focus to the still-mounted dialog input otherwise)
      setTimeout(() => {
        if (before && typeof before.focus === "function" && document.contains(before)) before.focus({ preventScroll: true });
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

function Overlay({ open, onClose, dismissible = true, kind = "dialog", size = "md", title, kicker, description, children, footer, tone, initialFocusRef, className, stackFooter = false, width }) {
  const { mounted, closing } = useExitTransition(open);
  const panelRef = useRef(null);
  const id = useId();
  useDialogBehaviour(mounted && !closing, panelRef, { onEscape: dismissible ? onClose : undefined, initialFocusRef });
  if (!mounted || typeof document === "undefined") return null;
  const isSheet = kind === "sheet";
  return createPortal(
    <div
      className={cx("ml-overlay", isSheet && "ml-overlay--sheet", closing && "is-closing")}
      onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={panelRef}
        role={tone === "danger" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={title ? `${id}-t` : undefined}
        aria-describedby={description ? `${id}-d` : undefined}
        tabIndex={-1}
        className={cx("ml-dialog", isSheet && "ml-sheet", !isSheet && size !== "md" && `ml-dialog--${size}`, className)}
        style={width ? { [isSheet ? "--sheet-w" : "--dialog-w"]: typeof width === "number" ? `${width}px` : width } : undefined}
      >
        <span className="ml-dialog__grab" aria-hidden="true" />
        {!isSheet && <span className={cx("ml-dialog__bar", tone === "danger" && "ml-dialog__bar--danger")} aria-hidden="true" />}
        {(title || dismissible) && (
          <div className="ml-dialog__head">
            <div className="ml-dialog__titles">
              {kicker && <SpecLabel>{kicker}</SpecLabel>}
              {title && <h2 className="ml-dialog__title" id={`${id}-t`}>{title}</h2>}
            </div>
            {dismissible && <IconButton label="Close" icon={<X aria-hidden="true" />} onClick={onClose} />}
          </div>
        )}
        <div className="ml-dialog__body">
          {description && <p id={`${id}-d`}>{description}</p>}
          {children}
        </div>
        {footer && <div className={cx("ml-dialog__foot", stackFooter && "ml-dialog__foot--stack")}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Modal — centred dialog on desktop, bottom sheet on phones. Focus is trapped,
 * Esc / scrim click / ✕ call onClose (unless dismissible={false}), focus returns
 * to the opener on close. Props: open, onClose, title, kicker (mono line above the
 * title), description, footer (buttons), size "sm"|"md"|"lg", tone "danger",
 * initialFocusRef (or mark a child with data-autofocus).
 */
export function Modal(props) {
  return <Overlay kind="dialog" {...props} />;
}

/** Sheet — side panel from the right on desktop, bottom sheet on phones. Same props as Modal (+ width). */
export function Sheet(props) {
  return <Overlay kind="sheet" {...props} />;
}

/* ───────────── confirm(): the in-page replacement for window.confirm ───────────── */

const ConfirmContext = createContext(null);

/**
 * <ConfirmProvider> + useConfirm():
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Start over?", body: "…", confirmLabel: "Start over", tone: "danger" })) …
 */
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef(null);
  const cancelRef = useRef(null);
  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setReq(typeof opts === "string" ? { title: opts } : opts);
    setOpen(true);
  }), []);
  const settle = (v) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpen(false);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={open}
        onClose={() => settle(false)}
        size="sm"
        tone={req?.tone}
        kicker={req?.kicker}
        title={req?.title}
        initialFocusRef={cancelRef}
        footer={
          <>
            <Button ref={cancelRef} variant="secondary" onClick={() => settle(false)}>{req?.cancelLabel || "Cancel"}</Button>
            <Button variant={req?.tone === "danger" ? "danger" : "primary"} onClick={() => settle(true)}>{req?.confirmLabel || "Confirm"}</Button>
          </>
        }
      >
        {req?.body && (typeof req.body === "string" ? <p>{req.body}</p> : req.body)}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm() must be used inside <ConfirmProvider>.");
  return ctx;
}

export default Modal;
