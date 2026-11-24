// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  defaultBasemapFor,
  type LatLng,
  type SearchResult,
  type SheetDetent,
  type ViewState,
} from "@mapcairn/core";
import {
  AccuracyCircle,
  Attribution,
  type DataLayers,
  EndStack,
  FocusRegistryProvider,
  LiveRegionProvider,
  MapChrome,
  MapDataLayers,
  MapOverlayLayer,
  MapReadout,
  MapView,
  MeasureOverlay,
  MeasureToolbar,
  PinMarker,
  SearchPill,
  SelectionProvider,
  ServicesProvider,
  Sheet,
  SheetContent,
  TooltipProvider,
  type UseLocate,
  type UseMeasure,
  useBasemaps,
  useDataLayers,
  useFeatureSelection,
  useLocate,
  useMap,
  useMeasure,
  useSettings,
  useTheme,
} from "@mapcairn/map";
import { useModelContextTool } from "@mapcairn/react";
import { type ReactNode, useState } from "react";
import { CAIRNS_LAYER } from "./cairnsLayer";
import { createExampleServices } from "./exampleServices";
import { EXAMPLE_THEMES, type ExampleTheme } from "./exampleThemes";
import { showResult } from "./showResult";

const PRIVACY_NOTE =
  "This example runs on the SDK's scripted fakes. Search looks only at a short list of invented places held in the page, and nothing is sent to any service.";
const INITIAL_VIEW: ViewState = {
  center: { lat: 57.05, lng: -3.65 },
  zoom: 11,
  bearing: 0,
};

/** Which group of sections the sheet holds, or null while it is closed. */
type OpenSheet = "map-options" | "settings" | null;

/**
 * The whole example: the services and the app-wide providers (services, the
 * one announcer and tooltips) around two maps. The services are built once
 * per mount, never at module scope, and both maps share them. Each map sits in
 * a wrapper that carries the class its theme is scoped to
 * (`exampleThemes.ts`); `data-theme` is read from the document element, which
 * the one theme setting writes, so light and dark are one choice for the page.
 * The page holds the one `main` landmark, and each map is named by its theme's
 * title (`MapView`'s `label`), so no two landmarks share a name.
 */
export function ExampleApp() {
  const [services] = useState(createExampleServices);
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>
          <main className="maps">
            {EXAMPLE_THEMES.map((theme) => (
              <div
                key={theme.className}
                data-testid={theme.className}
                className={`themed-map ${theme.className}`}
              >
                <ExampleMap theme={theme} />
              </div>
            ))}
          </main>
        </TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}

/** State the map's overlays and its chrome share. */
interface ExampleState {
  readonly layers: DataLayers;
  readonly measure: UseMeasure;
  readonly locate: UseLocate;
  readonly measuring: boolean;
  readonly setMeasuring: (measuring: boolean) => void;
  readonly pin: LatLng | null;
  readonly setPin: (pin: LatLng | null) => void;
  readonly sheetId: string;
  readonly basemapId: string;
  readonly setBasemapId: (id: string) => void;
}

interface ExampleMapProps {
  /** The theme whose wrapper this map sits in; its class names the map and its sheet. */
  readonly theme: ExampleTheme;
}

function ExampleMap({ theme }: ExampleMapProps) {
  const mapId = theme.className;
  const { settings } = useSettings();
  const catalogue = useBasemaps();
  const { resolved } = useTheme();
  const [chosenId, setBasemapId] = useState<string | null>(null);
  const basemap =
    chosenId === null
      ? defaultBasemapFor(catalogue, resolved)
      : catalogue.resolve(chosenId);
  const [measuring, setMeasuring] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const layers = useDataLayers();
  const selection = useFeatureSelection(layers);
  const measure = useMeasure(settings.units);
  const locate = useLocate(settings.units);
  const state: ExampleState = {
    layers,
    measure,
    locate,
    measuring,
    setMeasuring,
    pin,
    setPin,
    sheetId: `${mapId}-sheet`,
    basemapId: basemap.id,
    setBasemapId,
  };

  useModelContextTool({
    name: `show-cairns-${mapId}`,
    description: `Turns on the Cairns layer in the ${theme.title} map.`,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: () => {
      layers.setEnabled(CAIRNS_LAYER.id, true);
      return { content: [{ type: "text", text: "The Cairns layer is on." }] };
    },
  });

  return (
    <SelectionProvider selection={selection}>
      <MapView
        id={mapId}
        label={theme.title}
        initialView={INITIAL_VIEW}
        basemap={basemap}
        cursor={measuring ? "crosshair" : "grab"}
        onClick={(event) => {
          if (measuring) {
            measure.addPoint(event.latlng);
          }
        }}
        chrome={(background) => (
          <ExampleChrome state={state} background={background} />
        )}
      >
        <MapDataLayers layers={layers} ignoreTaps={measuring} />
        <MapOverlayLayer>
          {locate.fix ? (
            <AccuracyCircle
              center={locate.fix.position}
              accuracyMetres={locate.fix.accuracyMetres}
            />
          ) : null}
          {measuring ? (
            <MeasureOverlay points={measure.points} mode={measure.mode} />
          ) : null}
          {pin ? <PinMarker position={pin} /> : null}
        </MapOverlayLayer>
      </MapView>
    </SelectionProvider>
  );
}

interface ExampleChromeProps {
  readonly state: ExampleState;
  /** The map region, from `MapView`'s `chrome` render prop. */
  readonly background: ReactNode;
}

/** Everything floating over the map, laid out by `MapChrome`. */
function ExampleChrome({ state, background }: ExampleChromeProps) {
  const map = useMap();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <ChromeSlots state={state} background={background} />
    </FocusRegistryProvider>
  );
}

function ChromeSlots({ state, background }: ExampleChromeProps) {
  const map = useMap();
  const { settings } = useSettings();
  const catalogue = useBasemaps();
  const [open, setOpen] = useState<OpenSheet>(null);
  const [detent, setDetent] = useState<SheetDetent>("half");
  const [modal, setModal] = useState(false);
  const { layers, measure, locate, measuring, pin } = state;

  const toggle = (sheet: Exclude<OpenSheet, null>) => {
    setOpen((current) => (current === sheet ? null : sheet));
  };
  const showPick = (result: SearchResult) => {
    if (map.adapter) {
      showResult(map.adapter, result);
    }
  };
  const closeMeasure = () => {
    measure.clear();
    state.setMeasuring(false);
  };

  return (
    <MapChrome
      background={background}
      modal={modal}
      mainLandmark={false}
      topStart={<SearchPill onSelect={showPick} />}
      endStack={
        <EndStack
          bearing={map.view.bearing}
          onResetBearing={() => map.adapter?.resetBearing()}
          mapOptionsOpen={open === "map-options"}
          mapOptionsControls={state.sheetId}
          onMapOptions={() => toggle("map-options")}
          settingsOpen={open === "settings"}
          settingsControls={state.sheetId}
          onSettings={() => toggle("settings")}
          measuring={measuring}
          onMeasure={() =>
            measuring ? closeMeasure() : state.setMeasuring(true)
          }
          locating={locate.state === "locating"}
          onLocate={locate.locate}
          canZoomIn={map.canZoomIn}
          canZoomOut={map.canZoomOut}
          onZoomIn={() => map.adapter?.zoomIn()}
          onZoomOut={() => map.adapter?.zoomOut()}
        />
      }
      bottomStart={<MapReadout units={settings.units} latlng={null} />}
      bottomEnd={
        <Attribution
          basemap={catalogue.resolve(state.basemapId)}
          layerCredits={layers.credits}
        />
      }
      bottomCentre={
        measuring ? (
          <MeasureToolbar
            measure={measure}
            onAddPointAtCentre={() => measure.addPoint(map.view.center)}
            onDone={closeMeasure}
          />
        ) : null
      }
      sheet={
        <Sheet
          id={state.sheetId}
          open={open !== null}
          title={`${open === "settings" ? "Settings and help" : "Map options"} (${map.label})`}
          detent={detent}
          onDetentChange={setDetent}
          onModalChange={setModal}
          onClose={() => setOpen(null)}
        >
          {open ? (
            <SheetContent
              section={open === "settings" ? "settings" : undefined}
              basemapId={state.basemapId}
              onBasemapChange={state.setBasemapId}
              hasPin={pin !== null}
              onDropPin={() => state.setPin(map.view.center)}
              layers={layers}
              privacyNote={PRIVACY_NOTE}
            />
          ) : null}
        </Sheet>
      }
    />
  );
}
