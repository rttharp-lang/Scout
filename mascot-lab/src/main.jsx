import React from "react";
import { createRoot } from "react-dom/client";

// Self-hosted fonts (never Google Fonts links): display, body, spec labels, jersey lettering.
import "@fontsource/big-shoulders-display/700";
import "@fontsource/big-shoulders-display/800";
import "@fontsource/big-shoulders-display/900";
import "@fontsource/archivo/400";
import "@fontsource/archivo/500";
import "@fontsource/archivo/600";
import "@fontsource/archivo/700";
import "@fontsource/ibm-plex-mono/500";
import "@fontsource/ibm-plex-mono/600";
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
