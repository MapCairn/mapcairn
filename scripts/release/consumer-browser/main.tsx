// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import "@mapcairn/sdk/styles.css";
import "./page.css";
import {
  type BasemapDefinition,
  createFakeServices,
  LiveRegionProvider,
  MapView,
  mapOverlayTokens,
  ServicesProvider,
  TooltipProvider,
} from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
import { useState } from "react";
import { createRoot } from "react-dom/client";

// An app that names only the umbrella: the interface from its root and the
// engine adapter from its subpath. The page gives the adapter a basemap only
// when the button is pressed, so a check can see that nothing was requested
// before then.

const BASEMAP: BasemapDefinition = {
  id: "browser-check",
  name: "Browser check",
  source: { kind: "vector", styleUrl: import.meta.env.VITE_STYLE_URL },
  minZoom: 0,
  maxZoom: 22,
  attribution: [],
  appearance: "light",
};

const VIEW = { center: { lat: 0, lng: 0 }, zoom: 2, bearing: 0 };

/** The worker file, from Vite's own worker URL import, on the page's origin. */
async function loadWorkerUrl(): Promise<string> {
  const worker = await import(
    "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
  );
  return worker.default;
}

function App() {
  const [services] = useState(() =>
    createFakeServices({
      createMapAdapter: () => createMapLibreMapAdapter({ loadWorkerUrl }),
    }),
  );
  const [drawing, setDrawing] = useState(false);
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>
          <button type="button" onClick={() => setDrawing(true)}>
            Draw the map
          </button>
          {/* What the engine container's background must resolve to. */}
          <div
            data-testid="background-probe"
            hidden
            ref={(probe) => {
              if (probe !== null) {
                probe.style.backgroundColor = mapOverlayTokens.background;
              }
            }}
          />
          <div className="map-slot">
            {drawing ? (
              <MapView
                id="browser-check-map"
                initialView={VIEW}
                basemap={BASEMAP}
              />
            ) : null}
          </div>
        </TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The page has no #root element.");
}
createRoot(root).render(<App />);
