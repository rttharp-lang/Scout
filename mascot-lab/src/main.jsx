import React from "react";
import { createRoot } from "react-dom/client";

// Type (self-hosted, never Google Fonts links). The UI faces are declared in
// styles/fonts.css (latin + latin-ext only): Geist (UI/body), Archivo Variable (wide
// display), Geist Mono (metadata).
//
// Faces still drawn on CANVASES — loaded here so `document.fonts.load()` finds them:
//   · IBM Plex Mono 500/600 — the ascii effect on the main-thread fallback (the render
//     worker gets the same files from engine/worker/pool.js), the line sheet and the
//     collection exports.
//   · Big Shoulders Display 800/900 + static Archivo 400/600 — the line sheet poster
//     (ui/collection/lineSheet.js). Drop these once it moves to the Studio faces.
//   · Graduate — jersey lettering (renderMockup.js imports the same file, deduped).
// An @font-face costs nothing in the browser until something draws with it.
import "@fontsource/ibm-plex-mono/latin-500";
import "@fontsource/ibm-plex-mono/latin-600";
import "@fontsource/big-shoulders-display/latin-800";
import "@fontsource/big-shoulders-display/latin-900";
import "@fontsource/big-shoulders-display/latin-ext-800";
import "@fontsource/big-shoulders-display/latin-ext-900";
import "@fontsource/archivo/latin-400";
import "@fontsource/archivo/latin-600";
import "@fontsource/archivo/latin-ext-400";
import "@fontsource/archivo/latin-ext-600";
import "@fontsource/graduate/400";

import "./styles/fonts.css";
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
