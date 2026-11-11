import "@fontsource-variable/ibm-plex-sans/wght.css";
import "./page.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ExampleApp } from "./ExampleApp";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page has no #root element.");
}
createRoot(root).render(
  <StrictMode>
    <ExampleApp />
  </StrictMode>,
);
