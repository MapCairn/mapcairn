import { shouldShowZoomButtons } from "@karta/core";
import {
  Layers,
  LocateFixed,
  Minus,
  Navigation2,
  Pentagon,
  Plus,
  Route,
  Ruler,
  Settings,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { usePreferences, useSettings } from "../../services";
import { ControlGroup, IconButton, Surface } from "../../ui";
import { useFocusTarget } from "../focusRegistry";
import { useChromeSurface } from "../MapChrome/chromeSurface";
import * as styles from "./EndStack.css";
import { endStackMinHeightForZoom } from "./endStackHeight";

/** The Directions button, shown only when the host offers directions. */
export interface EndStackDirections {
  /** The directions panel is open. */
  readonly active: boolean;
  /** The id of the sheet or panel that Directions opens. */
  readonly controls: string;
  readonly onToggle: () => void;
}

/** Props for {@link EndStack}. The app passes map state from `useMap()`. */
export interface EndStackProps {
  /** Map bearing in degrees clockwise from north. */
  readonly bearing: number;
  readonly onResetBearing: () => void;
  /**
   * The sheet or panel that Map options opens is the open surface. False
   * while Settings is open, and while a pin card or Directions is shown in the
   * sheet.
   */
  readonly mapOptionsOpen: boolean;
  /** The id of the sheet or panel that Map options opens. */
  readonly mapOptionsControls: string;
  readonly onMapOptions: () => void;
  /** The settings sheet or panel (Settings and Help) is open. */
  readonly settingsOpen: boolean;
  /** The id of the sheet or panel that Settings opens. */
  readonly settingsControls: string;
  readonly onSettings: () => void;
  /** Measuring is on. */
  readonly measuring: boolean;
  readonly onMeasure: () => void;
  /**
   * The Directions button, between Measure and Locate me. Leave it out and
   * the button is not shown, for a host with no routing service.
   */
  readonly directions?: EndStackDirections;
  /**
   * Draw is on. With `onDraw`, the stack shows a Draw shapes button between
   * Measure and Locate me; without it the button is left out.
   */
  readonly drawing?: boolean;
  readonly onDraw?: () => void;
  /** A location request is in progress. Presses are ignored meanwhile. */
  readonly locating: boolean;
  readonly onLocate: () => void;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
}

/**
 * The end-stack slot content, a landmark named "Map tools" holding, top to
 * bottom: the compass (only while the map is rotated and the engine can
 * rotate), the "Map controls" group (Map options, Measure, Directions and Draw
 * shapes when the host offers them, Locate me, Settings) and the "Zoom
 * controls" group. The zoom group is never placed anywhere else.
 *
 * @remarks The zoom group follows `shouldShowZoomButtons`: the user's
 *   setting wins; otherwise it shows for a fine pointer unless the height
 *   `MapChrome` measured for the stack is too short. At a zoom limit the
 *   button is `aria-disabled` but stays focusable. Map options, Measure,
 *   Directions, Draw shapes and Settings register as focus targets, so
 *   closing their surfaces returns focus to them. The stack does not read the
 *   map; the app passes its state in.
 */
export function EndStack({
  bearing,
  onResetBearing,
  mapOptionsOpen,
  mapOptionsControls,
  onMapOptions,
  settingsOpen,
  settingsControls,
  onSettings,
  measuring,
  onMeasure,
  directions,
  drawing = false,
  onDraw,
  locating,
  onLocate,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
}: EndStackProps) {
  const rootRef = useRef<HTMLElement>(null);
  const registerMapOptions = useFocusTarget("map-options");
  const registerSettings = useFocusTarget("settings");
  const registerMeasure = useFocusTarget("measure");
  const registerDirections = useFocusTarget("directions");
  const registerDraw = useFocusTarget("draw");
  const { settings } = useSettings();
  const { finePointer } = usePreferences();
  const { endStackMaxHeight } = useChromeSurface();

  const showCompass = bearing !== 0;
  const zoom = shouldShowZoomButtons({
    setting: settings.zoomButtons,
    finePointer,
    availableHeight: endStackMaxHeight ?? Number.POSITIVE_INFINITY,
    minHeightForZoom: endStackMinHeightForZoom(
      showCompass,
      directions !== undefined,
      onDraw !== undefined,
    ),
  });

  // IconButton takes no ref, so the buttons are found through the stack.
  const setRoot = useCallback(
    (root: HTMLElement | null) => {
      rootRef.current = root;
      const find = (target: string) =>
        root
          ? root.querySelector<HTMLElement>(`[data-focus-target="${target}"]`)
          : null;
      registerMapOptions(find("map-options"));
      registerMeasure(find("measure"));
      registerDirections(find("directions"));
      registerDraw(find("draw"));
      registerSettings(find("settings"));
    },
    [
      registerMapOptions,
      registerMeasure,
      registerDirections,
      registerDraw,
      registerSettings,
    ],
  );

  useEffect(() => {
    rootRef.current?.style.setProperty("--chrome-bearing", `${bearing}deg`);
  }, [bearing]);

  return (
    <section
      ref={setRoot}
      aria-label="Map tools"
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
        {directions ? (
          <IconButton
            label="Directions"
            icon={Route}
            pressed={directions.active}
            controls={directions.controls}
            data-focus-target="directions"
            onClick={directions.onToggle}
          />
        ) : null}
        {onDraw ? (
          <IconButton
            label="Draw shapes"
            icon={Pentagon}
            pressed={drawing}
            data-focus-target="draw"
            onClick={onDraw}
          />
        ) : null}
        <IconButton
          label="Locate me"
          icon={LocateFixed}
          busy={locating}
          onClick={onLocate}
        />
        <IconButton
          label="Settings"
          icon={Settings}
          expanded={settingsOpen}
          controls={settingsControls}
          data-focus-target="settings"
          onClick={onSettings}
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
    </section>
  );
}
