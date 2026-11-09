import { shouldShowZoomButtons } from "@karta/core";
import {
  Layers,
  LocateFixed,
  Minus,
  Navigation2,
  Plus,
  Ruler,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { usePreferences, useSettings } from "../../services";
import { ControlGroup, IconButton, Surface } from "../../ui";
import { useFocusTarget } from "../focusRegistry";
import { useChromeSurface } from "../MapChrome/chromeSurface";
import * as styles from "./EndStack.css";

/** Height of one control, in CSS pixels (the 48 px `size.control` token). */
const CONTROL_PX = 48;
/** The gap between groups (the 12 px `space.sm` token). */
const GAP_PX = 12;
/** One hairline between grouped buttons, plus the surface border. */
const HAIRLINE_PX = 1;

/**
 * The height the end stack needs to show the zoom group under the main
 * group: three main controls, two zoom controls, the gap and the hairlines,
 * plus the compass and its gap while it shows. Below this, and only when the
 * user has not chosen to show zoom buttons, the zoom group yields.
 */
export function endStackMinHeightForZoom(compassShown: boolean): number {
  const groups = 5 * CONTROL_PX + GAP_PX + 7 * HAIRLINE_PX;
  return compassShown ? groups + CONTROL_PX + GAP_PX : groups;
}

/** Props for {@link EndStack}. The app passes map state from `useMap()`. */
export interface EndStackProps {
  /** Map bearing in degrees clockwise from north. */
  readonly bearing: number;
  /** The engine can rotate. Without it the compass never shows. */
  readonly supportsRotation: boolean;
  readonly onResetBearing: () => void;
  /** The map options sheet or panel is open. */
  readonly mapOptionsOpen: boolean;
  /** The id of the sheet or panel that Map options opens. */
  readonly mapOptionsControls: string;
  readonly onMapOptions: () => void;
  /** Measuring is on. */
  readonly measuring: boolean;
  readonly onMeasure: () => void;
  /** A location request is in progress. Presses are ignored meanwhile. */
  readonly locating: boolean;
  readonly onLocate: () => void;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
}

/**
 * The end-stack slot content, top to bottom: the compass (only while the map
 * is rotated and the engine can rotate), the "Map controls" group (Map
 * options, Measure, Locate me) and the "Zoom controls" group. The zoom group
 * is never placed anywhere else.
 *
 * @remarks The zoom group follows `shouldShowZoomButtons`: the user's
 *   setting wins; otherwise it shows for a fine pointer unless the height
 *   `MapChrome` measured for the stack is too short. At a zoom limit the
 *   button is `aria-disabled` but stays focusable. Map options and Measure
 *   register as focus targets, so closing their surfaces returns focus to
 *   them. The stack does not read the map; the app passes its state in.
 */
export function EndStack({
  bearing,
  supportsRotation,
  onResetBearing,
  mapOptionsOpen,
  mapOptionsControls,
  onMapOptions,
  measuring,
  onMeasure,
  locating,
  onLocate,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
}: EndStackProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const registerMapOptions = useFocusTarget("map-options");
  const registerMeasure = useFocusTarget("measure");
  const { settings } = useSettings();
  const { finePointer } = usePreferences();
  const { endStackMaxHeight } = useChromeSurface();

  const showCompass = supportsRotation && bearing !== 0;
  const zoom = shouldShowZoomButtons({
    setting: settings.zoomButtons,
    finePointer,
    availableHeight: endStackMaxHeight ?? Number.POSITIVE_INFINITY,
    minHeightForZoom: endStackMinHeightForZoom(showCompass),
  });

  // IconButton takes no ref, so the buttons are found through the stack.
  const setRoot = useCallback(
    (root: HTMLDivElement | null) => {
      rootRef.current = root;
      const find = (target: string) =>
        root
          ? root.querySelector<HTMLElement>(`[data-focus-target="${target}"]`)
          : null;
      registerMapOptions(find("map-options"));
      registerMeasure(find("measure"));
    },
    [registerMapOptions, registerMeasure],
  );

  useEffect(() => {
    rootRef.current?.style.setProperty("--chrome-bearing", `${bearing}deg`);
  }, [bearing]);

  return (
    <div
      ref={setRoot}
      data-testid="end-stack"
      data-zoom-yielded={zoom.yieldedToHeight ? "true" : "false"}
      className={styles.stack}
    >
      {showCompass ? (
        <Surface
          radius="control"
          data-chrome="end-stack-compass"
          className={styles.compassSurface}
        >
          <IconButton
            label="Reset bearing to north"
            icon={Navigation2}
            className={styles.compass}
            onClick={onResetBearing}
          />
        </Surface>
      ) : null}
      <ControlGroup
        label="Map controls"
        data-chrome="end-stack-controls"
        className={styles.group}
      >
        <IconButton
          label="Map options"
          icon={Layers}
          expanded={mapOptionsOpen}
          controls={mapOptionsControls}
          data-focus-target="map-options"
          onClick={onMapOptions}
        />
        <IconButton
          label="Measure distance and area"
          icon={Ruler}
          pressed={measuring}
          data-focus-target="measure"
          onClick={onMeasure}
        />
        <IconButton
          label="Locate me"
          icon={LocateFixed}
          busy={locating}
          onClick={onLocate}
        />
      </ControlGroup>
      {zoom.show ? (
        <ControlGroup
          label="Zoom controls"
          data-chrome="end-stack-zoom"
          className={styles.group}
        >
          <IconButton
            label="Zoom in"
            icon={Plus}
            disabled={!canZoomIn}
            onClick={onZoomIn}
          />
          <IconButton
            label="Zoom out"
            icon={Minus}
            disabled={!canZoomOut}
            onClick={onZoomOut}
          />
        </ControlGroup>
      ) : null}
    </div>
  );
}
