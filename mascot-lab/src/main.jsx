import React from "react";
import { createRoot } from "react-dom/client";

// Self-hosted fonts (never Google Fonts links): display, body, spec labels, jersey lettering.
// Only the subsets the page can show: latin everywhere, plus latin-ext for the display and
// body faces (team and player names a coach types: Ł, Ő, Ş, Ž…). The packages' default
// imports also carry vietnamese/cyrillic faces — ~260 KB of the single-file Artifact page.
// Graduate ships latin only; renderMockup.js imports the same file (deduped).
import "@fontsource/big-shoulders-display/latin-700";
import "@fontsource/big-shoulders-display/latin-800";
import "@fontsource/big-shoulders-display/latin-900";
import "@fontsource/big-shoulders-display/latin-ext-700";
import "@fontsource/big-shoulders-display/latin-ext-800";
import "@fontsource/big-shoulders-display/latin-ext-900";
import "@fontsource/archivo/latin-400";
import "@fontsource/archivo/latin-500";
import "@fontsource/archivo/latin-600";
import "@fontsource/archivo/latin-700";
import "@fontsource/archivo/latin-ext-400";
import "@fontsource/archivo/latin-ext-500";
import "@fontsource/archivo/latin-ext-600";
import "@fontsource/archivo/latin-ext-700";
import "@fontsource/ibm-plex-mono/latin-500";
import "@fontsource/ibm-plex-mono/latin-600";
import "@fontsource/graduate/400";

import "./styles/tokens.css";
import "./styles/global.css";
import "./ui/components/components.css";

import App from "./App.jsx";
import { applyTheme, savedTheme } from "./ui/components/ThemeSwitch.jsx";
import { prefetchCapabilities } from "./platform/claude.js";

applyTheme(savedTheme()); // before first paint: no light→dark flash
prefetchCapabilities(["downloads"]);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
