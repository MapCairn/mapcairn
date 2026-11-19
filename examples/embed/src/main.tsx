// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@mapcairn/theme/tokens.css";
import "@mapcairn/map/styles.css";
import "./page.css";
import { tokens } from "@mapcairn/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ExampleApp } from "./ExampleApp";

Object.assign(document.body.style, {
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  color: tokens.color.text,
  backgroundColor: tokens.color.pageBackground,
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page has no #root element.");
}
createRoot(root).render(
  <StrictMode>
    <ExampleApp />
  </StrictMode>,
);
