import {
  type BasemapDefinition,
  type LatLng,
  type MapAdapter,
  type MapCapabilities,
  type MapClickEvent,
  type MapEngineError,
  type MapKeyAction,
  mapKeyAction,
  mapKeyHelp,
  type ViewState,
} from "@karta/core";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
} from "react";
import { usePreferences } from "../services";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import { MapContext } from "./MapContext";
import * as styles from "./MapView.css";
import { type MapLongPressEvent, useLongPress } from "./useLongPress";
import { useMapEngine } from "./useMapEngine";
import { usePointerPosition } from "./usePointerPosition";

/** The pointer shown over the map: grab for panning, crosshair while measuring. */
export type MapCursor = "grab" | "crosshair";

/** Props for {@link MapView}. */
export interface MapViewProps {
  /** The view the first engine mounts with. Later changes are ignored. */
  readonly initialView: ViewState;
  /** The active basemap. Its `engine` decides which adapter is mounted. */
  readonly basemap: BasemapDefinition;
  /** Called when the view stops changing (`moveEnd`), not on every frame. */
  readonly onViewChange?: (view: ViewState) => void;
  /** Called after the other engine has mounted for a new basemap. */
  readonly onEngineSwitch?: (basemap: BasemapDefinition) => void;
  /**
   * Called when an engine cannot start or a basemap cannot be applied. The app
   * decides the fallback, for example a raster basemap when WebGL is missing.
   */
  readonly onEngineError?: (
    error: MapEngineError,
    basemap: BasemapDefinition,
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
  readonly testId?: string;
}

/** The hidden keyboard instructions, as plain sentences. */
function keyboardInstructions(capabilities: MapCapabilities): string {
  return mapKeyHelp(capabilities)
    .map(
      ({ keys, description }) =>
        `${keys}: ${description.charAt(0).toLowerCase()}${description.slice(1)}.`,
    )
    .join(" ");
}

/** Runs a key action against the adapter. */
function runKeyAction(
  adapter: MapAdapter,
  action: MapKeyAction,
  props: Pick<MapViewProps, "onDropPinKey" | "onEscape">,
): void {
  switch (action.type) {
    case "pan":
      adapter.panBy(action.dx, action.dy);
      break;
    case "zoomIn":
      adapter.zoomIn();
      break;
    case "zoomOut":
      adapter.zoomOut();
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
 * mounts the adapter that suits the active basemap, without knowing which
 * engine that is, and provides the live map to `children` through `useMap`.
 *
 * @remarks
 * - Keyboard and long-press are implemented here once, against the adapter,
 *   so both engines respond identically; the engine's own key handling is
 *   turned off.
 * - When the basemap needs the other engine, the old engine is destroyed and
 *   the new one mounts in a new element with the same centre, zoom and (where
 *   supported) bearing. This component, its children and the chrome around
 *   it stay mounted.
 * - Server rendering produces the empty region only; no style attributes are
 *   rendered, so it works under `style-src 'self'`. `data-zoom` is written
 *   with `setAttribute` once the engine reports a zoom.
 * - The host fills its parent; `MapChrome` owns its placement.
 */
export function MapView({
  initialView,
  basemap,
  onViewChange,
  onEngineSwitch,
  onEngineError,
  onClick,
  onLongPress,
  onPointerMove,
  onDropPinKey,
  onEscape,
  cursor = "grab",
  children,
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

  const map = useMapEngine({
    hostRef,
    slotRef,
    adapterRef,
    engineClassName: styles.engineElement,
    initialView,
    basemap,
    onViewChange,
    onEngineSwitch,
    onEngineError,
    onClick,
    onMoveEnd: longPress.cancel,
    shouldDropClick: longPress.consumeClick,
  });

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const adapter = adapterRef.current;
    const target = event.target as Node;
    if (
      !adapter ||
      (target !== event.currentTarget && !slotRef.current?.contains(target))
    ) {
      return;
    }
    const action = mapKeyAction(event, adapter.capabilities);
    if (!action) {
      return;
    }
    event.preventDefault();
    runKeyAction(adapter, action, { onDropPinKey, onEscape });
  };

  const motion = reducedMotion ? "static" : "animated";

  return (
    <>
      <section
        ref={hostRef}
        aria-label="Map"
        aria-roledescription="map"
        aria-describedby={helpId}
        aria-busy={map.loading}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the map region is the keyboard target for panning, zooming and pins.
        tabIndex={0}
        data-engine={basemap.engine}
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
        <MapContext.Provider value={map}>{children}</MapContext.Provider>
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
      <VisuallyHidden id={helpId}>
        {keyboardInstructions(map.capabilities)}
      </VisuallyHidden>
    </>
  );
}
