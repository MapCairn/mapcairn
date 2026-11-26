// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapCatalogue,
  type LatLng,
  type MapEngineError,
  type MapFeatureTap,
  resolveBasemapFor,
  type ViewState,
} from "@mapcairn/core";
import {
  AccuracyCircle,
  MapDataLayers,
  MapOverlayLayer,
  MapView,
  MeasureOverlay,
  PinMarker,
  useDataLayers,
  useLocate,
  useMeasure,
  useSettings,
  useTheme,
} from "@mapcairn/map";
import { useState } from "react";
import {
  MOUNTED_SHORTCUTS,
  MountedChrome,
  type OpenSheet,
} from "./MountedChrome";
import type { MapTool } from "./tools";

/** What one mounted map's interface needs from the mount. */
export interface MountedMapProps {
  readonly basemaps: BasemapCatalogue;
  /** The basemap the page or the person chose, or null for the theme's default. */
  readonly basemapId: string | null;
  /** Called when the person picks a basemap in the sheet. */
  readonly onBasemapChange: (id: string) => void;
  readonly label: string | undefined;
  readonly initialView: ViewState;
  /** The tools to compose. Zoom, the compass, the credits and the scale are always there. */
  readonly tools: ReadonlySet<MapTool>;
  /** Whether the page gave layers. The sheet lists them when it is a tool. */
  readonly hasLayers: boolean;
  readonly onViewChange: (view: ViewState) => void;
  readonly onClick: (position: LatLng) => void;
  readonly onFeatureTap: (tap: MapFeatureTap) => void;
  readonly onEngineError: (error: MapEngineError) => void;
}

/**
 * One map's interface: the engine host with zoom, the compass, the credits and
 * the scale, and the tools the page named. A tool that is not named gets no
 * handler, so its button, box or overlay is not drawn. The state the tools
 * share (measuring, the pin, the layers and the person's location) lives here,
 * so the overlays and the chrome read one copy.
 */
export function MountedMap({
  basemaps,
  basemapId,
  onBasemapChange,
  label,
  initialView,
  tools,
  hasLayers,
  onViewChange,
  onClick,
  onFeatureTap,
  onEngineError,
}: MountedMapProps) {
  const { resolved } = useTheme();
  const { settings } = useSettings();
  const basemap = resolveBasemapFor(basemaps, basemapId, resolved);
  const [measuring, setMeasuring] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [open, setOpen] = useState<OpenSheet>(null);
  const layers = useDataLayers();
  const measure = useMeasure(settings.units);
  const locate = useLocate(settings.units, { announceErrors: false });
  // The sheet returns focus to its opener when it closes.
  const closeOnEscape = () => {
    setOpen(null);
    if (measuring) {
      measure.clear();
      setMeasuring(false);
    }
  };
  return (
    <MapView
      label={label}
      initialView={initialView}
      basemap={basemap}
      cursor={measuring ? "crosshair" : "grab"}
      onViewChange={onViewChange}
      onClick={(event) => {
        if (measuring) {
          measure.addPoint(event.latlng);
        }
        onClick(event.latlng);
      }}
      onEngineError={onEngineError}
      shortcuts={MOUNTED_SHORTCUTS}
      onEscape={closeOnEscape}
      chrome={(background) => (
        <MountedChrome
          background={background}
          basemaps={basemaps}
          basemapId={basemap.id}
          onBasemapChange={onBasemapChange}
          tools={tools}
          hasLayers={hasLayers}
          layers={layers}
          measure={measure}
          measuring={measuring}
          setMeasuring={setMeasuring}
          locate={locate}
          pin={pin}
          setPin={setPin}
          open={open}
          setOpen={setOpen}
        />
      )}
    >
      {hasLayers ? (
        <MapDataLayers
          layers={layers}
          ignoreTaps={measuring}
          onFeatureTap={onFeatureTap}
        />
      ) : null}
      <MapOverlayLayer>
        {tools.has("locate") && locate.fix ? (
          <AccuracyCircle
            center={locate.fix.position}
            accuracyMetres={locate.fix.accuracyMetres}
          />
        ) : null}
        {measuring ? (
          <MeasureOverlay points={measure.points} mode={measure.mode} />
        ) : null}
        {pin ? <PinMarker position={pin} testId="pin-marker" /> : null}
      </MapOverlayLayer>
    </MapView>
  );
}
