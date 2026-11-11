import {
  announceNoFeaturesHere,
  announcePinCleared,
  announcePinDropped,
  type BasemapDefinition,
  blurSearch,
  boundsAroundPoint,
  clearPin,
  closeSurface,
  dropPin,
  type FocusTarget,
  initialSurfaceState,
  isSettingsSection,
  type LatLng,
  type MapClickEvent,
  openSearch,
  openSheet,
  type SearchResult,
  type SheetDetent,
  type SheetSection,
  type SurfaceAction,
  type SurfaceState,
  setDetent,
  startDirections,
  startDraw,
  startMeasure,
  stopDirections,
  stopDraw,
  stopMeasure,
  surfaceReducer,
  type ViewState,
} from "@mapcairn/core";
import {
  type DataLayers,
  type MapContextValue,
  type MapLongPressEvent,
  REVEAL_DETENT,
  type UseDirections,
  type UseDraw,
  type UseLocate,
  type UseMeasure,
  useAnnounce,
  useDataLayers,
  useDirections,
  useDraw,
  useLocate,
  useMeasure,
  useSettings,
  useUrlState,
} from "@mapcairn/map";
import { useLatestRef } from "@mapcairn/react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { initialMapState } from "./initialView";
import { type BasemapChoice, useBasemapChoice } from "./useBasemapChoice";
import { useViewPersistence } from "./useViewPersistence";

/** The zoom a single search result without bounds is shown at. */
export const RESULT_ZOOM = 14;

/** The closest a fit to a search result's bounds zooms in. */
export const RESULT_MAX_ZOOM = 16;

/** The closest a location fix is shown at, however precise it is. */
export const LOCATE_ZOOM = 15;

/**
 * The widest accuracy circle a location fix is fitted to. A coarser fix (a
 * desktop located by its network can be off by tens of kilometres) is shown
 * as if it were this precise, so the map never zooms out to a whole region.
 */
export const LOCATE_MAX_FIT_RADIUS_METRES = 25_000;

/** Room kept around the accuracy circle when a fix is fitted, in pixels. */
const LOCATE_FIT_PADDING_PX = 32;

/** Everything the app's chrome and overlays need, from one place. */
export interface MapApp {
  readonly state: SurfaceState;
  readonly dispatch: (action: SurfaceAction) => void;
  /**
   * Closes a surface because the person asked to (Close, Escape, Done, Clear
   * pin), so focus goes back to the control that opened it. Surfaces that
   * close because another one opened leave focus where it is.
   */
  readonly closeExplicitly: (action?: SurfaceAction) => void;
  /**
   * Moves focus back after an explicit close, once the surface has closed.
   * Safe to call more than once: only the first call after a close acts.
   */
  readonly flushFocusReturn: (
    restore: (target: FocusTarget | null) => void,
  ) => void;

  readonly initialView: ViewState;
  readonly onViewChange: (view: ViewState) => void;
  /** The live map, written by the chrome from inside the map context. */
  readonly mapRef: RefObject<MapContextValue | null>;

  readonly basemapChoice: string;
  readonly basemap: BasemapDefinition;
  /**
   * Every basemap on screen or about to be (see `useBasemapChoice`), which
   * the permanent credit and the Save image block follow.
   */
  readonly basemapsInUse: readonly BasemapDefinition[];
  readonly chooseBasemap: (id: string) => void;
  /**
   * A basemap that could not load or whose provider is down, until the person
   * goes back, or null. `stayed` is true when no other basemap was left to
   * draw, so the map did not change.
   */
  readonly basemapFailure: {
    readonly name: string;
    readonly unavailable: boolean;
    readonly stayed: boolean;
  } | null;
  /** Goes back to the basemap the map kept after a swap failed. */
  readonly restorePreviousBasemap: () => void;
  /** Pass to `MapView`'s `onBasemapApplied`. */
  readonly onBasemapApplied: (basemap: BasemapDefinition) => void;
  /** Pass to `MapView`'s `onEngineError`: falls back from a basemap that could not start the map. */
  readonly onEngineError: BasemapChoice["mountFailed"];
  /** Pass to `MapView`'s `onBasemapUnavailable`. */
  readonly onBasemapUnavailable: BasemapChoice["unavailableNow"];
  /** Pass to `MapView`'s `onBasemapError`. */
  readonly onBasemapError: (
    error: unknown,
    failed: BasemapDefinition,
    kept: BasemapDefinition,
  ) => void;

  readonly sheetOpen: boolean;
  readonly sheetSection: SheetSection;
  readonly sheetDetent: SheetDetent;
  readonly onSheetDetentChange: (detent: SheetDetent) => void;
  readonly sheetModal: boolean;
  readonly setSheetModal: (modal: boolean) => void;
  /**
   * The sheet that Map options opens is the open surface (Basemap, Pin,
   * Layers, Shapes, Save image). False while Settings is open, and while a pin
   * card or Directions is shown in the sheet.
   */
  readonly mapOptionsOpen: boolean;
  /** Settings is the open sheet (Settings and Help). */
  readonly settingsOpen: boolean;
  /** Opens Map options, closes it when it is open, or switches to it from Settings. */
  readonly toggleMapOptions: () => void;
  /** Opens Settings, closes it when it is open, or switches to it from Map options. */
  readonly toggleSettings: () => void;

  readonly pin: LatLng | null;
  /** Increases each time a pin card opens, so the chrome can focus its heading. */
  readonly pinFocusRequest: number;
  readonly dropPinAt: (position: LatLng) => void;
  readonly dropPinAtCentre: () => void;
  readonly clearPin: () => void;

  readonly measure: UseMeasure;
  readonly measuring: boolean;
  readonly toggleMeasure: () => void;
  readonly finishMeasure: () => void;
  readonly addPointAtCentre: () => void;

  /** The shapes: drawing state, selection and undo. Shapes outlive the tool. */
  readonly draw: UseDraw;
  readonly drawing: boolean;
  readonly toggleDraw: () => void;
  /** Closes the draw tool, dropping a shape that was not finished. */
  readonly finishDraw: () => void;
  /** Opens the sheet on the Shapes section, over the drawing. */
  readonly openShapes: () => void;

  readonly locate: UseLocate;

  /** The directions tool: stops, travel mode and the route or area on the map. */
  readonly directions: UseDirections;
  /** Directions is the open surface, so taps on the map add stops. */
  readonly directionsActive: boolean;
  /** Opens the directions panel, or closes it when it is open. */
  readonly toggleDirections: () => void;

  readonly cursor: LatLng | null;
  readonly setCursor: (position: LatLng | null) => void;

  readonly onMapClick: (event: MapClickEvent) => void;
  readonly onLongPress: (event: MapLongPressEvent) => void;
  readonly onSearchFocus: () => void;
  readonly onSearchBlur: () => void;
  readonly flyTo: (result: SearchResult) => void;

  /** The data layers: which are on, what loaded, the open card. */
  readonly layers: DataLayers;
  /** Opens the Layers section after a tap on a point has selected it. */
  readonly openFeature: () => void;
  /**
   * The keyboard route to what a tap finds: opens the card of the one feature
   * at the centre of the map, or the list when there are several, and says so
   * when there are none.
   */
  readonly identifyAtCentre: () => void;
  /** Brings the sheet to the detent that shows the card and the map together, after "Show on map". */
  readonly revealMap: () => void;
}

/**
 * The app's state and actions: the open surface, the pin, the measurement,
 * the location fix, the basemap and the view. It runs outside the map
 * context, so it reaches the live map through `mapRef`, which the chrome
 * fills in from `useMap()`.
 */
export function useMapApp(): MapApp {
  const { settings } = useSettings();
  const url = useUrlState();
  const announce = useAnnounce();
  const [link] = useState(() => url.read());
  const [initial] = useState(() => initialMapState(link, settings));
  const layers = useDataLayers({ initial: link.layers });
  const basemaps = useBasemapChoice(initial.basemapId);
  const persistence = useViewPersistence(
    initial.view,
    basemaps.savedChoice,
    layers.urlValue,
  );
  const [state, dispatch] = useReducer(surfaceReducer, initialSurfaceState);
  const stateRef = useLatestRef(state);
  const mapRef = useRef<MapContextValue | null>(null);
  const pendingFocusReturn = useRef(false);

  const [pin, setPin] = useState<LatLng | null>(null);
  const [panelDetent, setPanelDetent] = useState<SheetDetent>("half");
  const [pinFocusRequest, setPinFocusRequest] = useState(0);
  const [sheetModal, setSheetModal] = useState(false);
  const [cursor, setCursor] = useState<LatLng | null>(null);
  const measure = useMeasure(settings.units);
  const locate = useLocate(settings.units, { announceErrors: false });
  const directions = useDirections(settings.units);
  const draw = useDraw({
    units: settings.units,
    active: state.surface === "draw",
    getAdapter: () => mapRef.current?.adapter ?? null,
  });

  const closeExplicitly = useCallback(
    (action: SurfaceAction = closeSurface()) => {
      if (stateRef.current.surface !== "none") {
        pendingFocusReturn.current = true;
      }
      dispatch(action);
    },
    [stateRef],
  );

  const flushFocusReturn = useCallback(
    (restore: (target: FocusTarget | null) => void) => {
      const { surface, returnFocusTo } = stateRef.current;
      // Closing the sheet over a drawing or a measurement goes back to that
      // tool, not to nothing.
      const resumed =
        (surface === "draw" && returnFocusTo === "draw-shapes") ||
        (surface === "measure" && returnFocusTo === "measure");
      if (!pendingFocusReturn.current || (surface !== "none" && !resumed)) {
        return;
      }
      pendingFocusReturn.current = false;
      restore(stateRef.current.returnFocusTo);
    },
    [stateRef],
  );

  const centre = useCallback(
    () => mapRef.current?.adapter?.getView().center ?? null,
    [],
  );

  const dropPinAt = useCallback(
    (position: LatLng) => {
      // Measure and directions keep the surface to themselves, so the pin
      // card does not open and takes no focus.
      const keepsSurface =
        stateRef.current.surface === "measure" ||
        stateRef.current.surface === "directions";
      setPin(position);
      if (!keepsSurface) {
        setPanelDetent("half");
      }
      dispatch(dropPin());
      announce(announcePinDropped(position));
      if (!keepsSurface) {
        setPinFocusRequest((count) => count + 1);
      }
    },
    [announce, stateRef],
  );

  const dropPinAtCentre = useCallback(() => {
    const position = centre();
    if (position) {
      dropPinAt(position);
    }
  }, [centre, dropPinAt]);

  const clearPinAction = useCallback(() => {
    if (stateRef.current.surface === "pin") {
      pendingFocusReturn.current = true;
    }
    setPin(null);
    dispatch(clearPin());
    announce(announcePinCleared());
  }, [announce, stateRef]);

  // A measurement belongs to the measure surface: it goes when that closes,
  // unless the sheet is only open over it.
  const { clear: clearMeasure, addPoint } = measure;
  useEffect(() => {
    const suspended = state.surface === "sheet" && state.resumeMeasure;
    if (state.surface !== "measure" && !suspended) {
      clearMeasure();
    }
  }, [state.surface, state.resumeMeasure, clearMeasure]);

  const finishMeasure = useCallback(() => {
    closeExplicitly(stopMeasure());
  }, [closeExplicitly]);

  const toggleMeasure = useCallback(() => {
    if (stateRef.current.surface === "measure") {
      finishMeasure();
    } else {
      dispatch(startMeasure());
    }
  }, [finishMeasure, stateRef]);

  const toggleDirections = useCallback(() => {
    if (stateRef.current.surface === "directions") {
      closeExplicitly(stopDirections());
    } else {
      setPanelDetent("half");
      dispatch(startDirections());
    }
  }, [closeExplicitly, stateRef]);

  const finishDraw = useCallback(() => {
    closeExplicitly(stopDraw());
  }, [closeExplicitly]);

  const toggleDraw = useCallback(() => {
    if (stateRef.current.surface === "draw") {
      finishDraw();
    } else {
      dispatch(startDraw());
    }
  }, [finishDraw, stateRef]);

  const openShapes = useCallback(() => {
    dispatch(openSheet("shapes"));
  }, []);

  // The shapes stay when the tool closes, but one that was not finished goes,
  // unless the sheet is only open over the drawing.
  const { discardDraft } = draw;
  useEffect(() => {
    const suspended = state.surface === "sheet" && state.resumeDraw;
    if (state.surface !== "draw" && !suspended) {
      discardDraft();
    }
  }, [state.surface, state.resumeDraw, discardDraft]);

  const addPointAtCentre = useCallback(() => {
    const position = centre();
    if (position) {
      addPoint(position);
    }
  }, [centre, addPoint]);

  const toggleMapOptions = useCallback(() => {
    const { surface, sheetSection } = stateRef.current;
    if (surface === "sheet" && !isSettingsSection(sheetSection)) {
      closeExplicitly();
    } else {
      dispatch(openSheet());
    }
  }, [closeExplicitly, stateRef]);

  const toggleSettings = useCallback(() => {
    const { surface, sheetSection } = stateRef.current;
    if (surface === "sheet" && isSettingsSection(sheetSection)) {
      closeExplicitly();
    } else {
      dispatch(openSheet("settings"));
    }
  }, [closeExplicitly, stateRef]);

  const onSheetDetentChange = useCallback(
    (detent: SheetDetent) => {
      if (stateRef.current.surface === "sheet") {
        dispatch(setDetent(detent));
      } else {
        setPanelDetent(detent);
      }
    },
    [stateRef],
  );

  const { addStop } = directions;
  const onDrawClick = draw.onMapClick;
  const onMapClick = useCallback(
    (event: MapClickEvent) => {
      if (stateRef.current.surface === "measure") {
        addPoint(event.latlng);
      } else if (stateRef.current.surface === "directions") {
        addStop(event.latlng);
      } else if (stateRef.current.surface === "draw") {
        onDrawClick(event);
      }
    },
    [addPoint, addStop, onDrawClick, stateRef],
  );

  const onLongPress = useCallback(
    (event: MapLongPressEvent) => {
      dropPinAt(event.latlng);
    },
    [dropPinAt],
  );

  const flyTo = useCallback((result: SearchResult) => {
    const adapter = mapRef.current?.adapter;
    if (!adapter) {
      return;
    }
    if (result.bounds) {
      adapter.fitBounds(result.bounds, { maxZoom: RESULT_MAX_ZOOM });
    } else {
      adapter.setView({ center: result.centre, zoom: RESULT_ZOOM });
    }
  }, []);

  // Fit each new location fix's accuracy circle, so a coarse fix shows its
  // whole circle rather than filling the screen with it.
  useEffect(() => {
    const adapter = mapRef.current?.adapter;
    if (!locate.fix || !adapter) {
      return;
    }
    const { position, accuracyMetres } = locate.fix;
    const padding = LOCATE_FIT_PADDING_PX;
    adapter.fitBounds(
      boundsAroundPoint(
        position,
        Math.min(accuracyMetres, LOCATE_MAX_FIT_RADIUS_METRES),
      ),
      {
        maxZoom: LOCATE_ZOOM,
        padding: {
          top: padding,
          right: padding,
          bottom: padding,
          left: padding,
        },
      },
    );
  }, [locate.fix]);

  // The card and the map share the screen at REVEAL_DETENT. A peeking sheet
  // is too short to show the card, and a full one covers the map.
  const openFeature = useCallback(() => {
    dispatch(openSheet("layers"));
    if (stateRef.current.sheetDetent === "peek") {
      dispatch(setDetent(REVEAL_DETENT));
    }
  }, [stateRef]);

  const { choose } = layers;
  const identifyAtCentre = useCallback(() => {
    const adapter = mapRef.current?.adapter;
    if (!adapter) {
      return;
    }
    const hits = adapter.featuresAt(adapter.project(adapter.getView().center));
    if (hits.length === 0) {
      announce(announceNoFeaturesHere());
      return;
    }
    choose(hits, { focus: true });
    openFeature();
  }, [announce, choose, openFeature]);

  const revealMap = useCallback(() => {
    if (stateRef.current.surface === "sheet") {
      dispatch(setDetent(REVEAL_DETENT));
    }
  }, [stateRef]);

  const onSearchFocus = useCallback(() => dispatch(openSearch()), []);
  const onSearchBlur = useCallback(() => dispatch(blurSearch()), []);

  const sheetOpen =
    state.surface === "sheet" ||
    state.surface === "pin" ||
    state.surface === "directions";
  const settingsOpen =
    state.surface === "sheet" && isSettingsSection(state.sheetSection);
  return {
    state,
    dispatch,
    closeExplicitly,
    flushFocusReturn,
    initialView: initial.view,
    onViewChange: persistence.onViewChange,
    mapRef,
    basemapChoice: basemaps.choice,
    basemap: basemaps.basemap,
    basemapsInUse: basemaps.inUse,
    chooseBasemap: basemaps.choose,
    basemapFailure: basemaps.failure
      ? {
          name: basemaps.failure.name,
          unavailable: basemaps.failure.unavailable === true,
          stayed: basemaps.failure.kept.id === basemaps.failure.id,
        }
      : null,
    restorePreviousBasemap: basemaps.goBack,
    onBasemapApplied: basemaps.applied,
    onBasemapError: basemaps.failed,
    onBasemapUnavailable: basemaps.unavailableNow,
    onEngineError: basemaps.mountFailed,
    sheetOpen,
    sheetSection:
      state.surface === "pin" ? "pin" : (state.sheetSection ?? "basemap"),
    sheetDetent: state.surface === "sheet" ? state.sheetDetent : panelDetent,
    onSheetDetentChange,
    // The sheet reports `false` from an effect after it closes, too late for
    // the focus return in that same commit; derive it so the background stops
    // being inert in the render that closes the sheet.
    sheetModal: sheetModal && sheetOpen,
    setSheetModal,
    mapOptionsOpen: state.surface === "sheet" && !settingsOpen,
    settingsOpen,
    toggleMapOptions,
    toggleSettings,
    pin,
    pinFocusRequest,
    dropPinAt,
    dropPinAtCentre,
    clearPin: clearPinAction,
    measure,
    measuring: state.surface === "measure",
    toggleMeasure,
    finishMeasure,
    addPointAtCentre,
    draw,
    drawing: state.surface === "draw",
    toggleDraw,
    finishDraw,
    openShapes,
    locate,
    directions,
    directionsActive: state.surface === "directions",
    toggleDirections,
    cursor,
    setCursor,
    onMapClick,
    onLongPress,
    onSearchFocus,
    onSearchBlur,
    flyTo,
    layers,
    openFeature,
    identifyAtCentre,
    revealMap,
  };
}
