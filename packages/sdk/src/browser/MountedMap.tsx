// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapCatalogue,
  type LatLng,
  type MapEngineError,
  resolveBasemapFor,
  type ViewState,
} from "@mapcairn/core";
import {
  Attribution,
  EndStack,
  FocusRegistryProvider,
  MapChrome,
  MapReadout,
  MapView,
  useMap,
  useSettings,
  useTheme,
} from "@mapcairn/map";

/** What one mounted map's interface needs from the mount. */
export interface MountedMapProps {
  readonly basemaps: BasemapCatalogue;
  /** The basemap the page chose, or null for the theme's default. */
  readonly basemapId: string | null;
  readonly label: string | undefined;
  readonly initialView: ViewState;
  readonly onViewChange: (view: ViewState) => void;
  readonly onClick: (position: LatLng) => void;
  readonly onEngineError: (error: MapEngineError) => void;
}

/**
 * The first release's map: the engine host with zoom, the compass, the
 * credits and the scale. The tools come with the options that name them, so
 * the end stack gets no handler for any of its tool buttons and shows none.
 */
export function MountedMap({
  basemaps,
  basemapId,
  label,
  initialView,
  onViewChange,
  onClick,
  onEngineError,
}: MountedMapProps) {
  const { resolved } = useTheme();
  const basemap = resolveBasemapFor(basemaps, basemapId, resolved);
  return (
    <MapView
      label={label}
      initialView={initialView}
      basemap={basemap}
      onViewChange={onViewChange}
      onClick={(event) => onClick(event.latlng)}
      onEngineError={onEngineError}
      chrome={(background) => (
        <MountedChrome
          background={background}
          basemapId={basemap.id}
          basemaps={basemaps}
        />
      )}
    />
  );
}

interface MountedChromeProps {
  readonly background: React.ReactNode;
  readonly basemaps: BasemapCatalogue;
  readonly basemapId: string;
}

function MountedChrome({
  background,
  basemaps,
  basemapId,
}: MountedChromeProps) {
  const map = useMap();
  const { settings } = useSettings();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={false}
        mainLandmark={false}
        endStack={
          <EndStack
            bearing={map.view.bearing}
            onResetBearing={() => map.adapter?.resetBearing()}
            canZoomIn={map.canZoomIn}
            canZoomOut={map.canZoomOut}
            onZoomIn={() => map.adapter?.zoomIn()}
            onZoomOut={() => map.adapter?.zoomOut()}
          />
        }
        bottomStart={<MapReadout units={settings.units} latlng={null} />}
        bottomEnd={
          <Attribution
            basemap={basemaps.resolve(basemapId)}
            layerCredits={[]}
          />
        }
      />
    </FocusRegistryProvider>
  );
}
