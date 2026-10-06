import React from "react";
import { AlertTriangle, CheckCircle2, Info, AlertCircle, X } from "lucide-react";
import { IconButton } from "./IconButton.jsx";
import { cx } from "./cx.js";
import "./components.css";

const ICONS = { info: Info, warning: AlertTriangle, success: CheckCircle2, danger: AlertCircle };

/** Notice — inline banner. tone: "info" | "warning" | "success" | "danger"; onDismiss adds a close button. */
export function Notice({ tone = "info", title, children, onDismiss, action, className, ...rest }) {
  const Icon = ICONS[tone] || Info;
  return (
    <div className={cx("ml-notice", tone !== "info" && `ml-notice--${tone}`, className)} role={tone === "danger" ? "alert" : "status"} {...rest}>
      <Icon aria-hidden="true" />
      <div className="ml-notice__body">
        {title && <div className="ml-notice__title">{title}</div>}
        {children && <div>{children}</div>}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
      {onDismiss && <IconButton size="sm" label="Dismiss" icon={<X aria-hidden="true" />} onClick={onDismiss} />}
    </div>
  );
}

export default Notice;
