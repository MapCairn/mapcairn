import {
  creditsLine,
  imageExportBlockedBy,
  permanentCredit,
  pressEscape,
} from "@mapcairn/core";
import {
  Attribution,
  DirectionsPanel,
  DrawToolbar,
  EndStack,
  FocusRegistryProvider,
  MapChrome,
  type MapContextValue,
  MapReadout,
  MeasureToolbar,
  PermanentCredit,
  PinCard,
  SearchPill,
  Sheet,
  SheetContent,
  useFocusReturn,
  useMap,
  usePreferences,
  useSettings,
  visibleBounds,
} from "@mapcairn/map";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { ROUTING_CREDITS, ROUTING_NOTE } from "../constants/routingCredits";
import { SHEET_ID } from "./initialView";
import { hasBanners, MapBanners } from "./MapBanners";
import { bottomCentre } from "./MapBanners.css";
import { sheetTitle } from "./sheetTitle";
import type { MapApp } from "./useMapApp";
import { useZoomAnnouncement } from "./useZoomAnnouncement";

/** Props for {@link AppChrome}. */
export interface AppChromeProps {
  readonly app: MapApp;
  /** The map region, from `MapView`'s `chrome` render prop. */
  readonly background: ReactNode;
}

/**
 * Everything floating over the map, rendered inside the map context through
 * `MapView`'s `chrome` prop. It hands the live map to the app through
 * `app.mapRef` and owns the focus registry, whose fallback is the map region.
 */
export function AppChrome({ app, background }: AppChromeProps) {
  const map = useMap();
  const { mapRef } = app;
  useLayoutEffect(() => {
    mapRef.current = map;
  }, [mapRef, map]);
  useLayoutEffect(
    () => () => {
      mapRef.current = null;
    },
    [mapRef],
  );
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <ChromeContent app={app} map={map} background={background} />
    </FocusRegistryProvider>
  );
}

interface ChromeContentProps extends AppChromeProps {
  readonly map: MapContextValue;
}

function ChromeContent({ app, map, background }: ChromeContentProps) {
  const { settings } = useSettings();
  const { finePointer } = usePreferences();
  const restoreFocus = useFocusReturn();
  const requestZoomAnnouncement = useZoomAnnouncement(map);
  const pinHeadingRef = useRef<HTMLHeadingElement>(null);
  const { state, closeExplicitly, flushFocusReturn } = app;

  // The title follows the open sheet. Once it closes, the app state no longer
  // says which sheet it was, so the last title stays while it slides away.
  const currentTitle = sheetTitle(app);
  const shownTitle = useRef(currentTitle);
  if (app.sheetOpen) {
    shownTitle.current = currentTitle;
  }

  // Focus goes back to the opener once an explicitly closed surface is gone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the surface is the trigger; flushFocusReturn reads the current state through a ref.
  useEffect(() => {
    flushFocusReturn(restoreFocus);
  }, [state.surface, flushFocusReturn, restoreFocus]);

  // Escape from anywhere (search, measure toolbar) closes the open surface.
  // Controls that use Escape themselves (the sheet, the search list, the
  // credits, the map region) prevent its default, so it is not handled twice.
  useEffect(() => {
    const doc = map.hostElement?.ownerDocument ?? document;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        closeExplicitly(pressEscape());
      }
    };
    doc.addEventListener("keydown", onKeyDown);
    return () => doc.removeEventListener("keydown", onKeyDown);
  }, [map.hostElement, closeExplicitly]);

  // A newly opened pin card takes focus. This parent effect runs after the
  // sheet's own focus effects, so the card heading wins over the sheet title.
  // `preventScroll`, because the sheet content is already scrolling the Pin
  // section into view, and a scrolling focus would cut that scroll short.
  useEffect(() => {
    if (app.pinFocusRequest > 0) {
      pinHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [app.pinFocusRequest]);

  const zoomBy = (direction: "in" | "out") => {
    requestZoomAnnouncement();
    if (direction === "in") {
      map.adapter?.zoomIn();
    } else {
      map.adapter?.zoomOut();
    }
  };

  // Terms that follow a basemap while any of its pixels are, or are about to
  // be, on screen: its permanent credit, and a ban on saved images.
  const credit = permanentCredit(app.basemapsInUse);
  const imageBlockedBy = imageExportBlockedBy(app.basemapsInUse)?.name;
  const showBanners = hasBanners(app, map);
  const centre =
    app.measuring || app.drawing || showBanners ? (
      <div className={bottomCentre}>
        {app.measuring ? (
          <MeasureToolbar
            measure={app.measure}
            onAddPointAtCentre={app.addPointAtCentre}
            onDone={app.finishMeasure}
          />
        ) : null}
        {app.drawing ? (
          <DrawToolbar
            draw={app.draw}
            onDone={app.finishDraw}
            onOpenShapes={app.openShapes}
          />
        ) : null}
        {showBanners ? <MapBanners app={app} /> : null}
      </div>
    ) : null;

  return (
    <MapChrome
      background={background}
      modal={app.sheetModal}
      topStart={
        <SearchPill
          onSelect={app.flyTo}
          getBias={() => visibleBounds(map.adapter, map.hostElement)}
          onFocus={app.onSearchFocus}
          onBlur={app.onSearchBlur}
        />
      }
      endStack={
        <EndStack
          bearing={map.view.bearing}
          onResetBearing={() => map.adapter?.resetBearing()}
          mapOptionsOpen={app.mapOptionsOpen}
          mapOptionsControls={SHEET_ID}
          onMapOptions={app.toggleMapOptions}
          settingsOpen={app.settingsOpen}
          settingsControls={SHEET_ID}
          onSettings={app.toggleSettings}
          measuring={app.measuring}
          onMeasure={app.toggleMeasure}
          directions={
            app.directions.available
              ? {
                  active: app.directionsActive,
                  controls: SHEET_ID,
                  onToggle: app.toggleDirections,
                }
              : undefined
          }
          drawing={app.drawing}
          onDraw={app.toggleDraw}
          locating={app.locate.state === "locating"}
          onLocate={app.locate.locate}
          canZoomIn={map.canZoomIn}
          canZoomOut={map.canZoomOut}
          onZoomIn={() => zoomBy("in")}
          onZoomOut={() => zoomBy("out")}
        />
      }
      bottomStart={
        <MapReadout
          units={settings.units}
          latlng={finePointer ? app.cursor : null}
        />
      }
      bottomEnd={
        <Attribution
          basemap={app.basemap}
          permanentCredit={credit}
          layerCredits={
            app.directions.result
              ? [...app.layers.credits, ...ROUTING_CREDITS]
              : app.layers.credits
          }
        />
      }
      bottomCentre={centre}
      credit={credit ? <PermanentCredit credit={credit} /> : undefined}
      sheet={
        <Sheet
          id={SHEET_ID}
          open={app.sheetOpen}
          title={shownTitle.current}
          detent={app.sheetDetent}
          onDetentChange={app.onSheetDetentChange}
          onModalChange={app.setSheetModal}
          onClose={() => closeExplicitly()}
          restoreFocus={() => {
            // A resumed measure toolbar takes focus as it mounts, so the
            // effect above puts it back on Measure once that has happened.
            if (state.surface !== "measure") {
              flushFocusReturn(restoreFocus);
            }
          }}
          testId="map-options-sheet"
        >
          {app.directionsActive ? (
            <DirectionsPanel
              directions={app.directions}
              pin={app.pin}
              getBias={() => visibleBounds(map.adapter, map.hostElement)}
              note={ROUTING_NOTE}
            />
          ) : app.sheetOpen ? (
            <SheetContent
              basemapId={app.basemapChoice}
              onBasemapChange={app.chooseBasemap}
              hasPin={state.hasPin}
              onDropPin={app.dropPinAtCentre}
              section={app.sheetSection}
              layers={app.layers}
              draw={app.draw}
              onShowOnMap={app.revealMap}
              imageCredits={creditsLine(app.basemap, app.layers.credits)}
              imageBlockedBy={imageBlockedBy}
              pinCard={
                app.pin ? (
                  <PinCard
                    position={app.pin}
                    onClear={app.clearPin}
                    headingLevel={4}
                    headingRef={pinHeadingRef}
                  />
                ) : undefined
              }
            />
          ) : null}
        </Sheet>
      }
    />
  );
}
