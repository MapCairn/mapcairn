// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  DRAW_KEY_HELP,
  type LatLng,
  type MapEngineError,
  startMeasure,
} from "@mapcairn/core";
import {
  AccuracyCircle,
  CentreCrosshair,
  DirectionsOverlay,
  DrawMapBindings,
  DrawOverlay,
  MapDataLayers,
  MapDirections,
  MapOverlayLayer,
  MapView,
  type MeasureMode,
  MeasureOverlay,
  PinMarker,
  SelectionHighlights,
  SelectionMarker,
  SelectionProvider,
  useSettings,
  useTheme,
} from "@mapcairn/map";
import { useCallback, useState } from "react";
import { AppChrome } from "./app/AppChrome";
import { MAP_REGION_ID } from "./app/initialView";
import { MapPlaceholder, WhenDrawn } from "./app/MapPlaceholder";
import { MapUnavailable } from "./app/MapUnavailable";
import { mapFrame } from "./app/shell.css";
import { useMapApp } from "./app/useMapApp";
import { useMapModelContextTools } from "./webmcp/useMapModelContextTools";

/**
 * Where the map is: still behind the placeholder, drawn with its chrome, or
 * replaced by the map view's notice that its interface could not load.
 */
type MapStage = "waiting" | "drawn" | "cannot-start";

/** The stage once the map view has reported an error. */
function stageAfter(error: MapEngineError): MapStage {
  return error.reason === "interface-load-failed" ? "cannot-start" : "drawn";
}

/**
 * The map app: the engine host, the chrome around it and the overlays on it.
 * State and actions live in `useMapApp`; the chrome is rendered inside the
 * map context through `MapView`'s `chrome` prop. Render it only in the
 * browser (see `ClientOnly`), because it reads stored settings and device
 * preferences that the server cannot know.
 */
export function App() {
  const { setChoice } = useTheme();
  const { settings } = useSettings();
  const app = useMapApp();
  const { dispatch, measure } = app;

  const showMeasurement = useCallback(
    (mode: MeasureMode, points: readonly LatLng[]) => {
      dispatch(startMeasure());
      measure.setMode(mode);
      measure.clear();
      for (const point of points) {
        measure.addPoint(point);
      }
    },
    [dispatch, measure],
  );

  useMapModelContextTools({
    flyTo: app.flyTo,
    chooseBasemap: app.chooseBasemap,
    setTheme: setChoice,
    showMeasurement,
    units: settings.units,
  });

  // The placeholder stays until the map view draws, or says it cannot.
  const [stage, setStage] = useState<MapStage>("waiting");
  const drawn = useCallback(() => setStage("drawn"), []);

  const fix = app.locate.fix;
  return (
    <SelectionProvider selection={app.selection}>
      {stage === "waiting" ? <MapPlaceholder /> : null}
      {/* Always here: a map view moved into another element would mount again. */}
      <div
        className={mapFrame}
        role={stage === "cannot-start" ? "main" : undefined}
      >
        <MapView
          id={MAP_REGION_ID}
          testId="map-host"
          initialView={app.initialView}
          basemap={app.basemap}
          cursor={
            app.measuring || app.directionsActive || app.drawing
              ? "crosshair"
              : "grab"
          }
          onKeyCommand={(event) => app.draw.keyCommand(event)}
          keyHelp={app.drawing ? DRAW_KEY_HELP : undefined}
          onViewChange={app.onViewChange}
          onBasemapApplied={app.onBasemapApplied}
          onBasemapError={app.onBasemapError}
          onBasemapUnavailable={app.onBasemapUnavailable}
          onEngineError={(error, failed) => {
            setStage(stageAfter(error));
            app.onEngineError(error, failed);
          }}
          onClick={app.onMapClick}
          onLongPress={app.onLongPress}
          onPointerMove={app.setCursor}
          onDropPinKey={app.dropPinAtCentre}
          onIdentifyKey={app.identifyAtCentre}
          onEscape={app.onEscape}
          chrome={(map) => <AppChrome app={app} background={map} />}
        >
          <MapDataLayers
            layers={app.layers}
            onFeatureTap={app.openFeature}
            ignoreTaps={app.measuring || app.directionsActive || app.drawing}
          />
          <MapOverlayLayer testId="map-overlays">
            <SelectionMarker layers={app.layers} />
            <SelectionHighlights />
            {app.draw.shapes.length > 0 ? (
              <DrawOverlay
                shapes={app.draw.shapes}
                selection={app.draw.selection}
                handles={app.draw.handles}
                hoveredHandle={app.draw.hoveredHandle}
                hover={app.drawing ? (app.cursor ?? undefined) : undefined}
                testId="draw-overlay"
              />
            ) : null}
            {fix ? (
              <AccuracyCircle
                center={fix.position}
                accuracyMetres={fix.accuracyMetres}
                testId="accuracy-circle"
              />
            ) : null}
            {app.measuring ? (
              <>
                <MeasureOverlay
                  points={measure.points}
                  mode={measure.mode}
                  hover={app.cursor ?? undefined}
                  testId="measure-overlay"
                />
                <CentreCrosshair testId="centre-crosshair" />
              </>
            ) : null}
            <DirectionsOverlay
              stops={app.directions.stops}
              showCrosshair={app.directionsActive}
              testId="directions-overlay"
            />
            {app.pin ? (
              <PinMarker position={app.pin} testId="pin-marker" />
            ) : null}
          </MapOverlayLayer>
          <MapDirections result={app.directions.result} />
          <DrawMapBindings draw={app.draw} />
          <MapUnavailable />
          <WhenDrawn onDrawn={drawn} />
        </MapView>
      </div>
    </SelectionProvider>
  );
}
