// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/// <reference types="vite/client" />
import "./page.css";
import { createMapLibreMapAdapter } from "@mapcairn/adapter-maplibre";
import {
  BASEMAPS,
  type BasemapAttributionEntry,
  MapEngineError,
} from "@mapcairn/core";
import { type Page, START_BASEMAP_ID, showMap } from "./headlessMap";

function required<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`The page has no #${id} element of the expected kind.`);
  }
  return element;
}

const host = required("map", HTMLElement);
const select = required("basemap", HTMLSelectElement);
const status = required("status", HTMLOutputElement);
const credits = required("credits", HTMLParagraphElement);

// The map region is the one keyboard stop, and this page gives it the arrow and zoom keys.
host.tabIndex = 0;

function creditNode(entry: BasemapAttributionEntry): Node {
  if (!entry.href) {
    return document.createTextNode(entry.text);
  }
  const link = document.createElement("a");
  link.href = entry.href;
  link.textContent = entry.text;
  return link;
}

const page: Page = {
  setStatus: (text) => {
    status.textContent = text;
  },
  setBusy: (busy) => {
    host.setAttribute("aria-busy", String(busy));
  },
  setCredits: (entries) => {
    credits.replaceChildren(
      ...entries.flatMap((entry) => [creditNode(entry), " "]),
    );
  },
};

for (const basemap of BASEMAPS) {
  select.append(new Option(basemap.id, basemap.id));
}
select.value = START_BASEMAP_ID;

/** The worker file, from Vite's own worker URL import, on the page's origin. */
async function loadWorkerUrl(): Promise<string> {
  const worker = await import(
    "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
  );
  return worker.default;
}

/** The page has already told the person why the engine could not start, so that error ends here. */
function engineFailure(error: unknown): undefined {
  if (error instanceof MapEngineError) {
    return undefined;
  }
  throw error;
}

// biome-ignore lint/style/noRestrictedGlobals: this page has no DevicePreferences adapter, so it asks the browser directly.
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const map = await showMap({
  adapter: createMapLibreMapAdapter({ loadWorkerUrl }),
  host,
  page,
  reducedMotion,
}).catch(engineFailure);

if (map) {
  select.addEventListener("change", () => {
    void map.switchBasemap(select.value);
  });
  host.addEventListener("keydown", (event) => {
    if (map.handleKey(event.key)) {
      event.preventDefault();
    }
  });
  addEventListener("pagehide", () => map.destroy());
}
