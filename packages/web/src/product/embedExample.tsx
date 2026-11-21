// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/*
 * The embedding example the product page shows, from the first import on
 * (`EMBED_EXAMPLE_CODE` in `productContent.ts`). The README's "Embed a map"
 * `main.tsx` carries the same `MapScreen` and `Chrome`, character for
 * character, and a test keeps them equal; the README's file adds the page's
 * entry and the MapLibre adapter, which this page leaves on the fakes. It is
 * real code: typecheck compiles it against the SDK's entry points and
 * `embedExample.test.tsx` renders it, so the page cannot show code that does
 * not work.
 */
import "@mapcairn/theme/tokens.css";
import "@mapcairn/map/styles.css";
import { createFakeServices } from "@mapcairn/core";
import {
  FocusRegistryProvider,
  LiveRegionProvider,
  MapChrome,
  MapView,
  SearchPill,
  ServicesProvider,
  TooltipProvider,
  useBasemaps,
  useMap,
} from "@mapcairn/map";
import { type ReactNode, useState } from "react";

export function App() {
  const [services] = useState(createFakeServices);
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>
          <MapScreen />
        </TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}

function MapScreen() {
  const basemaps = useBasemaps();
  return (
    <MapView
      initialView={{
        center: { lat: -33.92, lng: 18.42 },
        zoom: 11,
        bearing: 0,
      }}
      basemap={basemaps.resolve(basemaps.defaultId)}
      chrome={(background) => <Chrome background={background} />}
    />
  );
}

function Chrome({ background }: { readonly background: ReactNode }) {
  const map = useMap();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={false}
        topStart={
          <SearchPill
            onSelect={(result) =>
              map.adapter?.setView({ center: result.centre, zoom: 14 })
            }
          />
        }
      />
    </FocusRegistryProvider>
  );
}
