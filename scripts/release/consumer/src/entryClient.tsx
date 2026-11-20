// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import "@mapcairn/theme/tokens.css";
import "@mapcairn/map/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The page has no #root element.");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
