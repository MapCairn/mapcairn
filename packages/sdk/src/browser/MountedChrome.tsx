// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  BasemapCatalogue,
  LatLng,
  SearchResult,
  SheetDetent,
} from "@mapcairn/core";
import {
  Attribution,
  type DataLayers,
  EndStack,
  FocusRegistryProvider,
  MapChrome,
  MapReadout,
  MeasureToolbar,
  SearchPill,
  Sheet,
  SheetContent,
  StatusMessage,
  type UseLocate,
  type UseMeasure,
  useFocusReturn,
  useMap,
  useMessages,
  useSettings,
} from "@mapcairn/map";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { showResult } from "./showResult";
import type { MapTool } from "./tools";
import { useShowFix } from "./useShowFix";

/** Which group of sections the sheet holds, or null while it is closed. */
type OpenSheet = "map-options" | "settings" | null;

/** What the chrome of one mounted map reads and changes. */
export interface MountedChromeProps {
  /** The map region, from `MapView`'s `chrome` render prop. */
  readonly background: ReactNode;
  readonly basemaps: BasemapCatalogue;
  readonly basemapId: string;
  readonly onBasemapChange: (id: string) => void;
  readonly tools: ReadonlySet<MapTool>;
  /** Whether the page gave layers, for the sheet's layers section. */
  readonly hasLayers: boolean;
  readonly layers: DataLayers;
  readonly measure: UseMeasure;
  readonly measuring: boolean;
  readonly setMeasuring: (measuring: boolean) => void;
  readonly locate: UseLocate;
  readonly pin: LatLng | null;
  readonly setPin: (pin: LatLng | null) => void;
}

/**
 * Everything floating over one mounted map, laid out by `MapChrome`: the
 * always-present zoom, compass, credits and scale, and what the tools add. The
 * focus registry sits here so closing the sheet returns focus to the button
 * that opened it.
 */
export function MountedChrome(props: MountedChromeProps) {
  const map = useMap();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <ChromeSlots {...props} />
    </FocusRegistryProvider>
  );
}

function ChromeSlots({
  background,
  basemaps,
  basemapId,
  onBasemapChange,
  tools,
  hasLayers,
  layers,
  measure,
  measuring,
  setMeasuring,
  locate,
  pin,
  setPin,
}: MountedChromeProps) {
  const map = useMap();
  const { settings } = useSettings();
  const { t } = useMessages();
  const sheetId = useId();
  const [open, setOpen] = useState<OpenSheet>(null);
  const [detent, setDetent] = useState<SheetDetent>("half");
  const [modal, setModal] = useState(false);
  const restoreFocus = useFocusReturn();
  const opener = useRef<Exclude<OpenSheet, null>>("map-options");
  const wasMeasuring = useRef(false);
  const hasMapOptions = tools.has("map-options");
  const hasSheet = hasMapOptions || tools.has("settings");

  useShowFix(tools.has("locate") ? locate.fix : null);
  // Done, or pressing Measure again, returns focus to Measure once the toolbar is gone.
  useEffect(() => {
    if (wasMeasuring.current && !measuring) {
      restoreFocus("measure");
    }
    wasMeasuring.current = measuring;
  }, [measuring, restoreFocus]);

  const toggle = (sheet: Exclude<OpenSheet, null>) => {
    opener.current = sheet;
    setOpen((current) => (current === sheet ? null : sheet));
  };
  const closeMeasure = () => {
    measure.clear();
    setMeasuring(false);
  };
  const showPick = (result: SearchResult) => {
    if (map.adapter) {
      showResult(map.adapter, result);
    }
  };
  const sheetTitle = () => {
    const title =
      open === "settings"
        ? t("app.sheetTitle.settings", {})
        : t("app.sheetTitle.mapOptions", {});
    return map.label ? `${title} (${map.label})` : title;
  };

  return (
    <MapChrome
      background={background}
      modal={modal}
      mainLandmark={false}
      topStart={
        tools.has("search") ? <SearchPill onSelect={showPick} /> : undefined
      }
      endStack={
        <EndStack
          bearing={map.view.bearing}
          onResetBearing={() => map.adapter?.resetBearing()}
          mapOptionsOpen={open === "map-options"}
          mapOptionsControls={sheetId}
          onMapOptions={hasMapOptions ? () => toggle("map-options") : undefined}
          settingsOpen={open === "settings"}
          settingsControls={sheetId}
          onSettings={
            tools.has("settings") ? () => toggle("settings") : undefined
          }
          measuring={measuring}
          onMeasure={
            tools.has("measure")
              ? () => (measuring ? closeMeasure() : setMeasuring(true))
              : undefined
          }
          locating={locate.state === "locating"}
          onLocate={tools.has("locate") ? locate.locate : undefined}
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
          layerCredits={layers.credits}
        />
      }
      bottomCentre={
        locate.state === "error" || measuring ? (
          <>
            {locate.state === "error" ? (
              <StatusMessage
                variant="error"
                action={{
                  label: t("app.banner.tryAgain", {}),
                  onClick: locate.locate,
                }}
                onDismiss={locate.cancel}
              >
                {locate.message}
              </StatusMessage>
            ) : null}
            {measuring ? (
              <MeasureToolbar
                measure={measure}
                onAddPointAtCentre={() => measure.addPoint(map.view.center)}
                onDone={closeMeasure}
              />
            ) : null}
          </>
        ) : null
      }
      sheet={
        hasSheet ? (
          <Sheet
            id={sheetId}
            open={open !== null}
            title={sheetTitle()}
            detent={detent}
            onDetentChange={setDetent}
            onModalChange={setModal}
            onClose={() => setOpen(null)}
            restoreFocus={() => restoreFocus(opener.current)}
          >
            {open ? (
              <SheetContent
                section={open === "settings" ? "settings" : undefined}
                basemapId={basemapId}
                onBasemapChange={onBasemapChange}
                hasPin={pin !== null}
                onDropPin={() => setPin(map.view.center)}
                layers={hasLayers ? layers : undefined}
                intro=""
                privacyHref={null}
                privacyNote={null}
                hasSearch={tools.has("search")}
              />
            ) : null}
          </Sheet>
        ) : undefined
      }
    />
  );
}
