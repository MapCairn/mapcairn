// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices } from "@mapcairn/core";
import {
  Attribution,
  EndStack,
  FocusRegistryProvider,
  LiveRegionProvider,
  MapChrome,
  MapReadout,
  MapView,
  SearchPill,
  ServicesProvider,
  TooltipProvider,
  useBasemaps,
  useMap,
  useSettings,
} from "@mapcairn/map";
import { type ReactNode, useState } from "react";

const INITIAL_VIEW = {
  center: { lat: 57.05, lng: -3.65 },
  zoom: 11,
  bearing: 0,
};

function Chrome({ background }: { readonly background: ReactNode }) {
  const map = useMap();
  const { settings } = useSettings();
  const catalogue = useBasemaps();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={false}
        topStart={<SearchPill onSelect={() => undefined} />}
        endStack={
          <EndStack
            bearing={map.view.bearing}
            onResetBearing={() => undefined}
            mapOptionsOpen={false}
            mapOptionsControls="sheet"
            onMapOptions={() => undefined}
            settingsOpen={false}
            settingsControls="sheet"
            onSettings={() => undefined}
            measuring={false}
            onMeasure={() => undefined}
            locating={false}
            onLocate={() => undefined}
            canZoomIn
            canZoomOut
            onZoomIn={() => undefined}
            onZoomOut={() => undefined}
          />
        }
        bottomStart={<MapReadout units={settings.units} latlng={null} />}
        bottomEnd={
          <Attribution
            basemap={catalogue.resolve(catalogue.defaultId)}
            layerCredits={[]}
          />
        }
      />
    </FocusRegistryProvider>
  );
}

/**
 * The map chrome on the SDK's fakes: what a host that brings its own map
 * engine would draw first, and what a server renders.
 */
export function App() {
  const [services] = useState(createFakeServices);
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>
          <MapInside />
        </TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}

function MapInside() {
  const catalogue = useBasemaps();
  return (
    <MapView
      id="consumer-map"
      initialView={INITIAL_VIEW}
      basemap={catalogue.resolve(catalogue.defaultId)}
      chrome={(background) => <Chrome background={background} />}
    />
  );
}
