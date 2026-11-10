import {
  DRAW_KEY_HELP,
  type LatLng,
  pressEscape,
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
  SelectionMarker,
  useSettings,
  useTheme,
} from "@mapcairn/map";
import { useCallback } from "react";
import { AppChrome } from "./app/AppChrome";
import { MAP_REGION_ID } from "./app/initialView";
import { MapUnavailable } from "./app/MapUnavailable";
import { useMapApp } from "./app/useMapApp";
import { useMapModelContextTools } from "./webmcp/useMapModelContextTools";

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
  const { dispatch, measure, closeExplicitly } = app;

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

  const fix = app.locate.fix;
  return (
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
      onEngineError={app.onEngineError}
      onClick={app.onMapClick}
      onLongPress={app.onLongPress}
      onPointerMove={app.setCursor}
      onDropPinKey={app.dropPinAtCentre}
      onIdentifyKey={app.identifyAtCentre}
      onEscape={() => closeExplicitly(pressEscape())}
      chrome={(map) => <AppChrome app={app} background={map} />}
    >
      <MapDataLayers
        layers={app.layers}
        onFeatureTap={app.openFeature}
        ignoreTaps={app.measuring || app.directionsActive || app.drawing}
      />
      <MapOverlayLayer testId="map-overlays">
        <SelectionMarker layers={app.layers} />
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
        {app.pin ? <PinMarker position={app.pin} testId="pin-marker" /> : null}
      </MapOverlayLayer>
      <MapDirections result={app.directions.result} />
      <DrawMapBindings draw={app.draw} />
      <MapUnavailable />
    </MapView>
  );
}
