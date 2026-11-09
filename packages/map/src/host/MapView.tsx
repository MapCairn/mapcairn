import {
  type BasemapDefinition,
  type LatLng,
  MAP_KEY_HELP,
  type MapAdapter,
  type MapClickEvent,
  type MapEngineError,
  type MapKeyAction,
  mapKeyAction,
  type ViewState,
} from "@karta/core";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
} from "react";
import { usePreferences } from "../services";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import { MapContext, type MapContextValue } from "./MapContext";
import * as styles from "./MapView.css";
import { type MapLongPressEvent, useLongPress } from "./useLongPress";
import { useMapEngine } from "./useMapEngine";
import { usePointerPosition } from "./usePointerPosition";

/** The pointer shown over the map: grab for panning, crosshair while measuring. */
export type MapCursor = "grab" | "crosshair";

/** Props for {@link MapView}. */
export interface MapViewProps {
  /** The view the engine mounts with. Later changes are ignored. */
  readonly initialView: ViewState;
  /** The active basemap. A change is applied to the mounted engine with `setBasemap`. */
  readonly basemap: BasemapDefinition;
  /** Called when the view stops changing (`moveEnd`), not on every frame. */
  readonly onViewChange?: (view: ViewState) => void;
  /**
   * Called when the engine cannot start or stops working. The
   * app decides what to show, for example a message when WebGL is missing.
   */
  readonly onEngineError?: (
    error: MapEngineError,
    basemap: BasemapDefinition,
  ) => void;
  /**
   * Called when a change of `basemap` has loaded on the mounted engine, so
   * the app can save the choice only once it is known to work.
   */
  readonly onBasemapApplied?: (basemap: BasemapDefinition) => void;
  /**
   * Called when a change of `basemap` could not load. The map keeps drawing
   * `kept`, the basemap that last loaded, and this is not an engine error:
   * `useMap().error` stays null. Passing `kept` back as `basemap` causes no
   * second swap.
   */
  readonly onBasemapError?: (
    error: MapEngineError,
    failed: BasemapDefinition,
    kept: BasemapDefinition,
  ) => void;
  /** A click or tap on the map. Not called for the click that ends a long-press. */
  readonly onClick?: (event: MapClickEvent) => void;
  /** A long-press (touch or mouse) or a right-click. */
  readonly onLongPress?: (event: MapLongPressEvent) => void;
  /**
   * The position under a mouse or pen, at most once per frame, or null when
   * it leaves the map. For the cursor coordinates readout; touch is ignored.
   */
  readonly onPointerMove?: (latlng: LatLng | null) => void;
  /** The P key, which drops a pin at the centre of the map. */
  readonly onDropPinKey?: () => void;
  /** The Escape key while the map has focus. */
  readonly onEscape?: () => void;
  /** Defaults to `grab`. */
  readonly cursor?: MapCursor;
  /** Overlays and other content that reads the map through `useMap`. */
  readonly children?: ReactNode;
  /** The id of the map region, for example the target of a skip link. */
  readonly id?: string;
  /**
   * Renders the chrome around the map, inside the map context. It receives
   * the map region (with its hidden keyboard help) and returns the tree to
   * render in its place, so controls that call `useMap`, such as the scale
   * bar and the credits, can sit beside the map rather than inside it:
   * `chrome={(map) => <MapChrome background={map} ... />}`. Called on every
   * render; put hooks in the components it returns, not in the function.
   */
  readonly chrome?: (map: ReactNode) => ReactNode;
  readonly testId?: string;
}

/** The hidden keyboard instructions, as plain sentences. */
const KEYBOARD_INSTRUCTIONS = MAP_KEY_HELP.map(
  ({ keys, description }) =>
    `${keys}: ${description.charAt(0).toLowerCase()}${description.slice(1)}.`,
).join(" ");

/** Runs a key action against the adapter. */
function runKeyAction(
  adapter: MapAdapter,
  action: MapKeyAction,
  props: Pick<MapViewProps, "onDropPinKey" | "onEscape"> & {
    readonly onUserZoom: () => void;
  },
): void {
  switch (action.type) {
    case "pan":
      adapter.panBy(action.dx, action.dy);
      break;
    case "zoomIn":
      adapter.zoomIn();
      props.onUserZoom();
      break;
    case "zoomOut":
      adapter.zoomOut();
      props.onUserZoom();
      break;
    case "rotate":
      adapter.rotateBy(action.degrees);
      break;
    case "resetBearing":
      adapter.resetBearing();
      break;
    case "dropPin":
      props.onDropPinKey?.();
      break;
    case "escape":
      props.onEscape?.();
      break;
  }
}

/**
 * The engine host: the map region and the single focus stop of the map. It
 * mounts the adapter the services build, without knowing which engine that
 * is, and provides the live map to `children` through `useMap`.
 *
 * @remarks
 * - Keyboard and long-press are implemented here once, against the adapter;
 *   the engine's own key handling is turned off.
 * - A new basemap is swapped in on the mounted engine, keeping the centre,
 *   zoom and bearing. This component, its children and the chrome around it
 *   stay mounted.
 * - Server rendering produces the empty region only; no style attributes are
 *   rendered, so it works under `style-src 'self'`. `data-zoom` is written
 *   with `setAttribute` once the engine reports a zoom.
 * - The host fills its parent; `MapChrome` owns its placement.
 * - The whole output, including `chrome`, is inside the map context.
 */
export function MapView({
  initialView,
  basemap,
  onViewChange,
  onEngineError,
  onBasemapApplied,
  onBasemapError,
  onClick,
  onLongPress,
  onPointerMove,
  onDropPinKey,
  onEscape,
  cursor = "grab",
  children,
  id,
  chrome,
  testId,
}: MapViewProps) {
  const hostRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<MapAdapter | null>(null);
  const helpId = useId();
  const { reducedMotion } = usePreferences();

  const getAdapter = useCallback(() => adapterRef.current, []);
  const longPress = useLongPress({ hostRef, getAdapter, onLongPress });
  const pointer = usePointerPosition({ hostRef, getAdapter, onPointerMove });

  // Listeners for zooms the person makes on the map itself. A set in a ref,
  // not state: a gesture reports many steps, and none should re-render.
  const userZoomListeners = useRef(new Set<() => void>());
  const notifyUserZoom = useCallback(() => {
    for (const listener of [...userZoomListeners.current]) {
      listener();
    }
  }, []);
  const onUserZoom = useCallback((listener: () => void) => {
    userZoomListeners.current.add(listener);
    return () => {
      userZoomListeners.current.delete(listener);
    };
  }, []);

  const engine = useMapEngine({
    hostRef,
    slotRef,
    adapterRef,
    engineClassName: styles.engineElement,
    initialView,
    basemap,
    onViewChange,
    onEngineError,
    onBasemapApplied,
    onBasemapError,
    onClick,
    onMoveEnd: longPress.cancel,
    shouldDropClick: longPress.consumeClick,
    onUserZoom: notifyUserZoom,
  });
  const map = useMemo<MapContextValue>(
    () => ({ ...engine, onUserZoom }),
    [engine, onUserZoom],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const adapter = adapterRef.current;
    const target = event.target as Node;
    if (
      !adapter ||
      (target !== event.currentTarget && !slotRef.current?.contains(target))
    ) {
      return;
    }
    const action = mapKeyAction(event);
    if (!action) {
      return;
    }
    event.preventDefault();
    runKeyAction(adapter, action, {
      onDropPinKey,
      onEscape,
      onUserZoom: notifyUserZoom,
    });
  };

  const motion = reducedMotion ? "static" : "animated";

  const region = (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the focused map region is the one keyboard and pointer target for panning, zooming, pins and long-press; each gesture has a button or key equivalent. */}
      <section
        ref={hostRef}
        id={id}
        aria-label="Map"
        aria-roledescription="map"
        aria-describedby={helpId}
        aria-busy={map.loading}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the map region is the keyboard target for panning, zooming and pins.
        tabIndex={0}
        data-map-host=""
        data-state={map.error ? "error" : undefined}
        data-testid={testId}
        className={styles.host[cursor]}
        onKeyDown={onKeyDown}
        {...longPress.handlers}
        onPointerMove={(event) => {
          longPress.handlers.onPointerMove(event);
          pointer.onPointerMove(event);
        }}
        onPointerLeave={pointer.onPointerLeave}
      >
        <div ref={slotRef} className={styles.engineSlot} />
        {children}
        {map.loading ? (
          <div
            className={styles.loadingTrack[motion]}
            data-testid="map-loading"
            data-motion={motion}
            aria-hidden="true"
          >
            <div className={styles.loadingBar} />
          </div>
        ) : null}
      </section>
      <VisuallyHidden id={helpId}>{KEYBOARD_INSTRUCTIONS}</VisuallyHidden>
    </>
  );

  return (
    <MapContext.Provider value={map}>
      {chrome ? chrome(region) : region}
    </MapContext.Provider>
  );
}
