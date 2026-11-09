import { pressEscape } from "@karta/core";
import {
  Attribution,
  EndStack,
  FocusRegistryProvider,
  MapChrome,
  type MapContextValue,
  MapReadout,
  MeasureToolbar,
  PinCard,
  SearchPill,
  Sheet,
  SheetContent,
  useFocusReturn,
  useMap,
  usePreferences,
  useSettings,
  visibleBounds,
} from "@karta/map";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { SHEET_ID } from "./initialView";
import { hasBanners, MapBanners } from "./MapBanners";
import { bottomCentre } from "./MapBanners.css";
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

  const showBanners = hasBanners(app, map);
  const centre =
    app.measuring || showBanners ? (
      <div className={bottomCentre}>
        {app.measuring ? (
          <MeasureToolbar
            measure={app.measure}
            onAddPointAtCentre={app.addPointAtCentre}
            onDone={app.finishMeasure}
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
          mapOptionsOpen={state.surface === "sheet"}
          mapOptionsControls={SHEET_ID}
          onMapOptions={app.toggleMapOptions}
          measuring={app.measuring}
          onMeasure={app.toggleMeasure}
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
        <Attribution basemap={app.basemap} layerCredits={app.layers.credits} />
      }
      bottomCentre={centre}
      sheet={
        <Sheet
          id={SHEET_ID}
          open={app.sheetOpen}
          title="Map options"
          detent={app.sheetDetent}
          onDetentChange={app.onSheetDetentChange}
          onModalChange={app.setSheetModal}
          onClose={() => closeExplicitly()}
          restoreFocus={() => flushFocusReturn(restoreFocus)}
          testId="map-options-sheet"
        >
          {app.sheetOpen ? (
            <SheetContent
              basemapId={app.basemapChoice}
              onBasemapChange={app.chooseBasemap}
              hasPin={state.hasPin}
              onDropPin={app.dropPinAtCentre}
              section={app.sheetSection}
              layers={app.layers}
              onShowOnMap={app.revealMap}
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
