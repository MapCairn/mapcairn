import { type LatLng, pressEscape, startMeasure } from "@karta/core";
import {
  AccuracyCircle,
  CentreCrosshair,
  MapOverlayLayer,
  MapView,
  type MeasureMode,
  MeasureOverlay,
  PinMarker,
  useSettings,
  useTheme,
} from "@karta/map";
import { useCallback } from "react";
import { AppChrome } from "./app/AppChrome";
import { MAP_REGION_ID } from "./app/initialView";
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
  const { resolved, setChoice } = useTheme();
  const { settings } = useSettings();
  const app = useMapApp(resolved);
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
      cursor={app.measuring ? "crosshair" : "grab"}
      onViewChange={app.onViewChange}
      onEngineSwitch={app.onEngineSwitch}
      onEngineError={app.onEngineError}
      onClick={app.onMapClick}
      onLongPress={app.onLongPress}
      onPointerMove={app.setCursor}
      onDropPinKey={app.dropPinAtCentre}
      onEscape={() => closeExplicitly(pressEscape())}
      chrome={(map) => <AppChrome app={app} background={map} />}
    >
      <MapOverlayLayer testId="map-overlays">
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
        {app.pin ? <PinMarker position={app.pin} testId="pin-marker" /> : null}
      </MapOverlayLayer>
    </MapView>
  );
}
