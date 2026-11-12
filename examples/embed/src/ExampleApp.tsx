import type {
  LatLng,
  SearchResult,
  SheetDetent,
  ViewState,
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
  ServicesProvider,
  Sheet,
  SheetContent,
  TooltipProvider,
  type UseLocate,
  type UseMeasure,
  useBasemaps,
  useDataLayers,
  useLocate,
  useMap,
  useMeasure,
  useSettings,
} from "@mapcairn/map";
import { useModelContextTool } from "@mapcairn/react";
import { type ReactNode, useState } from "react";
import { CAIRNS_LAYER } from "./cairnsLayer";
import { createExampleServices } from "./exampleServices";

const MAP_ID = "example-map";
const SHEET_ID = "example-sheet";
const RESULT_ZOOM = 14;
const PRIVACY_NOTE =
  "This example runs on the SDK's scripted fakes and sends nothing to any service.";
const INITIAL_VIEW: ViewState = {
  center: { lat: 57.05, lng: -3.65 },
  zoom: 11,
  bearing: 0,
};

/** Which group of sections the sheet holds, or null while it is closed. */
type OpenSheet = "map-options" | "settings" | null;

/**
 * The whole example: the services and the app-wide providers (services, the
 * one announcer and tooltips) around the map. The services are built once
 * per mount, never at module scope.
 */
export function ExampleApp() {
  const [services] = useState(createExampleServices);
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>
          <ExampleMap />
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
  readonly basemapId: string;
  readonly setBasemapId: (id: string) => void;
}

function ExampleMap() {
  const { settings } = useSettings();
  const catalogue = useBasemaps();
  const [basemapId, setBasemapId] = useState(catalogue.defaultId);
  const [measuring, setMeasuring] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const layers = useDataLayers();
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
    basemapId,
    setBasemapId,
  };

  useModelContextTool({
    name: "show-cairns",
    description: "Turns on the example's Cairns layer.",
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
    <MapView
      id={MAP_ID}
      initialView={INITIAL_VIEW}
      basemap={catalogue.resolve(basemapId)}
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
  const showResult = (result: SearchResult) => {
    map.adapter?.setView({ center: result.centre, zoom: RESULT_ZOOM });
  };
  const closeMeasure = () => {
    measure.clear();
    state.setMeasuring(false);
  };

  return (
    <MapChrome
      background={background}
      modal={modal}
      topStart={<SearchPill onSelect={showResult} />}
      endStack={
        <EndStack
          bearing={map.view.bearing}
          onResetBearing={() => map.adapter?.resetBearing()}
          mapOptionsOpen={open === "map-options"}
          mapOptionsControls={SHEET_ID}
          onMapOptions={() => toggle("map-options")}
          settingsOpen={open === "settings"}
          settingsControls={SHEET_ID}
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
          id={SHEET_ID}
          open={open !== null}
          title={open === "settings" ? "Settings and help" : "Map options"}
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
