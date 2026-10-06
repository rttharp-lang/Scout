import React, { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Segmented } from "./Segmented.jsx";
import * as storage from "../../platform/storage.js";

export const THEME_KEY = "mascot-lab:theme";

/** applyTheme("auto" | "light" | "dark") — sets/clears data-theme on <html>. */
export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
  else root.removeAttribute("data-theme");
}

/** The viewer's saved theme preference (per-viewer convenience; defaults to "auto"). */
export function savedTheme() {
  const m = storage.load(THEME_KEY, "auto");
  return m === "light" || m === "dark" ? m : "auto";
}

/** ThemeSwitch — Auto / Light / Dark. Remembers the choice on this device. */
export function ThemeSwitch({ className }) {
  const [mode, setMode] = useState(savedTheme);
  useEffect(() => {
    applyTheme(mode);
    storage.save(THEME_KEY, mode);
  }, [mode]);
  return (
    <Segmented
      className={className}
      label="Colour theme"
      size="sm"
      mono
      value={mode}
      onChange={setMode}
      options={[
        { value: "auto", label: "Auto", icon: <Monitor aria-hidden="true" />, title: "Match your device" },
        { value: "light", label: "Light", icon: <Sun aria-hidden="true" /> },
        { value: "dark", label: "Dark", icon: <Moon aria-hidden="true" /> },
      ]}
    />
  );
}

export default ThemeSwitch;
