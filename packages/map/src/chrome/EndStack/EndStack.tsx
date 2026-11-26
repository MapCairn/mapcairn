// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { shouldShowZoomButtons } from "@mapcairn/core";
import {
  Gear,
  GpsFix,
  Minus,
  NavigationArrow,
  Path,
  Plus,
  Polygon,
  Ruler,
  Stack,
} from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useLandmarkName } from "../../host/useLandmarkName";
import { useMessages, usePreferences, useSettings } from "../../services";
import { ControlGroup, IconButton, Surface } from "../../ui";
import { useFocusTarget } from "../focusRegistry";
import { useChromeSurface } from "../MapChrome/chromeSurface";
import { useScrollEdges } from "../useScrollEdges";
import * as styles from "./EndStack.css";
import { endStackMinHeightForZoom } from "./endStackHeight";

/** The Directions button, shown only when the host offers directions. */
export interface EndStackDirections {
  /** The directions panel is open. */
  readonly active: boolean;
  /** The id of the sheet or panel that Directions opens. */
  readonly controls: string;
  /** Opens the directions panel, or closes it when `active`. */
  readonly onToggle: () => void;
}

/** Props for {@link EndStack}. The app passes map state from `useMap()`. */
export interface EndStackProps {
  /** Map bearing in degrees clockwise from north. */
  readonly bearing: number;
  /** Turns the map back to north. The compass button that calls it is shown only while the bearing is not zero. */
  readonly onResetBearing: () => void;
  /**
   * The sheet or panel that Map options opens is the open surface. False
   * while Settings is open, and while a pin card or Directions is shown in the
   * sheet.
   */
  readonly mapOptionsOpen?: boolean;
  /** The id of the sheet or panel that Map options opens. Without it the button sets no `aria-controls`. */
  readonly mapOptionsControls?: string;
  /** Opens or closes the Map options sheet or panel. Leaving it out hides the Map options button. */
  readonly onMapOptions?: () => void;
  /** The settings sheet or panel (Settings and Help) is open. */
  readonly settingsOpen?: boolean;
  /** The id of the sheet or panel that Settings opens. Without it the button sets no `aria-controls`. */
  readonly settingsControls?: string;
  /** Opens or closes the settings sheet or panel. Leaving it out hides the Settings button. */
  readonly onSettings?: () => void;
  /** Measuring is on. */
  readonly measuring?: boolean;
  /** Turns measuring on or off. Leaving it out hides the Measure button. */
  readonly onMeasure?: () => void;
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
  /** Turns drawing on or off. Leaving it out hides the Draw shapes button. */
  readonly onDraw?: () => void;
  /** A location request is in progress. Presses are ignored meanwhile. */
  readonly locating?: boolean;
  /**
   * Asks for the person's location. Called only from a press, because the
   * browser may prompt. Leaving it out hides the Locate me button.
   */
  readonly onLocate?: () => void;
  /** False at the maximum zoom, which disables the Zoom in button. */
  readonly canZoomIn: boolean;
  /** False at the minimum zoom, which disables the Zoom out button. */
  readonly canZoomOut: boolean;
  /** Zooms the map in one step. */
  readonly onZoomIn: () => void;
  /** Zooms the map out one step. */
  readonly onZoomOut: () => void;
}

/**
 * The end-stack slot content, a landmark named "Map tools" holding, top to
 * bottom: the compass (only while the map is rotated and the engine can
 * rotate), the "Map controls" group (Map options, Measure, Directions and Draw
 * shapes, Locate me and Settings, each shown only when the host passes what it
 * needs, and the group left out when none is shown) and the "Zoom
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
  mapOptionsOpen = false,
  mapOptionsControls,
  onMapOptions,
  settingsOpen = false,
  settingsControls,
  onSettings,
  measuring = false,
  onMeasure,
  directions,
  drawing = false,
  onDraw,
  locating = false,
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
  const { t } = useMessages();
  const landmarkName = useLandmarkName("chrome.endStack.label");
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
      [onMapOptions, onMeasure, onLocate, onSettings].filter(
        (handler) => handler !== undefined,
      ).length,
    ),
  });
  const showMainControls =
    onMapOptions !== undefined ||
    onMeasure !== undefined ||
    directions !== undefined ||
    onDraw !== undefined ||
    onLocate !== undefined ||
    onSettings !== undefined;

  // IconButton takes no ref, so the buttons are found through the stack. A
  // button that appears or goes (a host changing what it passes) is registered
  // or released as it does.
  const hasMapOptions = onMapOptions !== undefined;
  const hasMeasure = onMeasure !== undefined;
  const hasDirections = directions !== undefined;
  const hasDraw = onDraw !== undefined;
  const hasSettings = onSettings !== undefined;
  useEffect(() => {
    const root = rootRef.current;
    const find = (target: string) =>
      root?.querySelector<HTMLElement>(`[data-focus-target="${target}"]`) ??
      null;
    registerMapOptions(hasMapOptions ? find("map-options") : null);
    registerMeasure(hasMeasure ? find("measure") : null);
    registerDirections(hasDirections ? find("directions") : null);
    registerDraw(hasDraw ? find("draw") : null);
    registerSettings(hasSettings ? find("settings") : null);
    return () => {
      registerMapOptions(null);
      registerMeasure(null);
      registerDirections(null);
      registerDraw(null);
      registerSettings(null);
    };
  }, [
    hasMapOptions,
    hasMeasure,
    hasDirections,
    hasDraw,
    hasSettings,
    registerMapOptions,
    registerMeasure,
    registerDirections,
    registerDraw,
    registerSettings,
  ]);

  useEffect(() => {
    rootRef.current?.style.setProperty("--chrome-bearing", `${bearing}deg`);
  }, [bearing]);
  useScrollEdges(rootRef);

  return (
    <section
      ref={rootRef}
      aria-label={landmarkName}
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
            label={t("chrome.endStack.resetBearing", {})}
            icon={NavigationArrow}
            className={styles.compass}
            onClick={onResetBearing}
          />
        </Surface>
      ) : null}
      {showMainControls ? (
        <ControlGroup
          label={t("chrome.endStack.controls", {})}
          data-chrome="end-stack-controls"
          className={styles.group}
        >
          {onMapOptions ? (
            <IconButton
              label={t("chrome.endStack.mapOptions", {})}
              icon={Stack}
              expanded={mapOptionsOpen}
              controls={mapOptionsControls}
              data-focus-target="map-options"
              onClick={onMapOptions}
            />
          ) : null}
          {onMeasure ? (
            <IconButton
              label={t("chrome.endStack.measure", {})}
              icon={Ruler}
              pressed={measuring}
              data-focus-target="measure"
              onClick={onMeasure}
            />
          ) : null}
          {directions ? (
            <IconButton
              label={t("chrome.endStack.directions", {})}
              icon={Path}
              pressed={directions.active}
              controls={directions.controls}
              data-focus-target="directions"
              onClick={directions.onToggle}
            />
          ) : null}
          {onDraw ? (
            <IconButton
              label={t("chrome.endStack.draw", {})}
              icon={Polygon}
              pressed={drawing}
              data-focus-target="draw"
              onClick={onDraw}
            />
          ) : null}
          {onLocate ? (
            <IconButton
              label={t("chrome.endStack.locate", {})}
              icon={GpsFix}
              busy={locating}
              onClick={onLocate}
            />
          ) : null}
          {onSettings ? (
            <IconButton
              label={t("chrome.endStack.settings", {})}
              icon={Gear}
              expanded={settingsOpen}
              controls={settingsControls}
              data-focus-target="settings"
              onClick={onSettings}
            />
          ) : null}
        </ControlGroup>
      ) : null}
      {zoom.show ? (
        <ControlGroup
          label={t("chrome.endStack.zoomControls", {})}
          data-chrome="end-stack-zoom"
          className={styles.group}
        >
          <IconButton
            label={t("chrome.endStack.zoomIn", {})}
            icon={Plus}
            disabled={!canZoomIn}
            onClick={onZoomIn}
          />
          <IconButton
            label={t("chrome.endStack.zoomOut", {})}
            icon={Minus}
            disabled={!canZoomOut}
            onClick={onZoomOut}
          />
        </ControlGroup>
      ) : null}
    </section>
  );
}
