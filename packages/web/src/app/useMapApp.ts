import {
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
  startMeasure,
  stopMeasure,
  surfaceReducer,
  type ViewState,
} from "@karta/core";
import {
  type MapContextValue,
  type MapLongPressEvent,
  type UseLocate,
  type UseMeasure,
  useAnnounce,
  useLocate,
  useMeasure,
  useSettings,
  useUrlState,
} from "@karta/map";
import { useLatestRef } from "@karta/react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { initialMapState } from "./initialView";
import { useBasemapChoice } from "./useBasemapChoice";
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
  readonly chooseBasemap: (id: string) => void;
  /** The name of a basemap that could not load, until the person goes back, or null. */
  readonly basemapFailure: string | null;
  /** Goes back to the basemap the map kept after a swap failed. */
  readonly restorePreviousBasemap: () => void;
  /** Pass to `MapView`'s `onBasemapApplied`. */
  readonly onBasemapApplied: (basemap: BasemapDefinition) => void;
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
  readonly toggleMapOptions: () => void;

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

  readonly locate: UseLocate;

  readonly cursor: LatLng | null;
  readonly setCursor: (position: LatLng | null) => void;

  readonly onMapClick: (event: MapClickEvent) => void;
  readonly onLongPress: (event: MapLongPressEvent) => void;
  readonly onSearchFocus: () => void;
  readonly onSearchBlur: () => void;
  readonly flyTo: (result: SearchResult) => void;
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
  const [initial] = useState(() => initialMapState(url.read(), settings));
  const basemaps = useBasemapChoice(initial.basemapId);
  const persistence = useViewPersistence(initial.view, basemaps.savedChoice);
  const [state, dispatch] = useReducer(surfaceReducer, initialSurfaceState);
  const stateRef = useLatestRef(state);
  const mapRef = useRef<MapContextValue | null>(null);
  const pendingFocusReturn = useRef(false);

  const [pin, setPin] = useState<LatLng | null>(null);
  const [pinDetent, setPinDetent] = useState<SheetDetent>("half");
  const [pinFocusRequest, setPinFocusRequest] = useState(0);
  const [sheetModal, setSheetModal] = useState(false);
  const [cursor, setCursor] = useState<LatLng | null>(null);
  const measure = useMeasure(settings.units);
  const locate = useLocate(settings.units, { announceErrors: false });

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
      if (!pendingFocusReturn.current || stateRef.current.surface !== "none") {
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
      const measuring = stateRef.current.surface === "measure";
      setPin(position);
      setPinDetent("half");
      dispatch(dropPin());
      announce(announcePinDropped(position));
      if (!measuring) {
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

  // A measurement belongs to the measure surface: it goes when that closes.
  const { clear: clearMeasure, addPoint } = measure;
  useEffect(() => {
    if (state.surface !== "measure") {
      clearMeasure();
    }
  }, [state.surface, clearMeasure]);

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

  const addPointAtCentre = useCallback(() => {
    const position = centre();
    if (position) {
      addPoint(position);
    }
  }, [centre, addPoint]);

  const toggleMapOptions = useCallback(() => {
    if (stateRef.current.surface === "sheet") {
      closeExplicitly();
    } else {
      dispatch(openSheet());
    }
  }, [closeExplicitly, stateRef]);

  const onSheetDetentChange = useCallback(
    (detent: SheetDetent) => {
      if (stateRef.current.surface === "sheet") {
        dispatch(setDetent(detent));
      } else {
        setPinDetent(detent);
      }
    },
    [stateRef],
  );

  const onMapClick = useCallback(
    (event: MapClickEvent) => {
      if (stateRef.current.surface === "measure") {
        addPoint(event.latlng);
      }
    },
    [addPoint, stateRef],
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

  const onSearchFocus = useCallback(() => dispatch(openSearch()), []);
  const onSearchBlur = useCallback(() => dispatch(blurSearch()), []);

  const sheetOpen = state.surface === "sheet" || state.surface === "pin";
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
    chooseBasemap: basemaps.choose,
    basemapFailure: basemaps.failure?.name ?? null,
    restorePreviousBasemap: basemaps.goBack,
    onBasemapApplied: basemaps.applied,
    onBasemapError: basemaps.failed,
    sheetOpen,
    sheetSection:
      state.surface === "pin" ? "pin" : (state.sheetSection ?? "basemap"),
    sheetDetent: state.surface === "sheet" ? state.sheetDetent : pinDetent,
    onSheetDetentChange,
    // The sheet reports `false` from an effect after it closes, too late for
    // the focus return in that same commit; derive it so the background stops
    // being inert in the render that closes the sheet.
    sheetModal: sheetModal && sheetOpen,
    setSheetModal,
    toggleMapOptions,
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
    locate,
    cursor,
    setCursor,
    onMapClick,
    onLongPress,
    onSearchFocus,
    onSearchBlur,
    flyTo,
  };
}
