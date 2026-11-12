// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  computeScaleBar,
  formatLatLng,
  type LatLng,
  type UnitSystem,
} from "@mapcairn/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMap } from "../../host";
import { usePreferences } from "../../services";
import * as styles from "./MapReadout.css";

/** The widest the scale bar may be, in CSS pixels. */
export const SCALE_BAR_MAX_WIDTH_PX = 96;

/** How long the scale bar stays after the zoom last changed before it fades. */
export const SCALE_BAR_IDLE_MS = 2000;

/** Props for {@link ScaleBar}. */
export interface ScaleBarProps {
  readonly units: UnitSystem;
}

/**
 * Whether focus arrived from the keyboard. Where `:focus-visible` is not
 * supported, focus is treated as keyboard focus, so the bar stays shown.
 */
function isKeyboardFocus(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  try {
    return target.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * Tracks whether keyboard focus is inside the map host. The host is
 * focusable, so a click or tap on the map focuses it too; that pointer focus
 * does not count, and a pointer press on the map ends keyboard focus. Focus
 * moving between elements inside the host does not count as leaving it.
 */
function useMapHasKeyboardFocus(host: HTMLElement | null): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!host) {
      setFocused(false);
      return;
    }
    const onFocusIn = (event: FocusEvent) => {
      setFocused(isKeyboardFocus(event.target));
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (!(next instanceof Node && host.contains(next))) {
        setFocused(false);
      }
    };
    const onPointerDown = () => {
      setFocused(false);
    };
    host.addEventListener("focusin", onFocusIn);
    host.addEventListener("focusout", onFocusOut);
    host.addEventListener("pointerdown", onPointerDown);
    return () => {
      host.removeEventListener("focusin", onFocusIn);
      host.removeEventListener("focusout", onFocusOut);
      host.removeEventListener("pointerdown", onPointerDown);
    };
  }, [host]);
  return focused;
}

/**
 * A scale bar drawn straight on the map: a thin line with end ticks and a
 * haloed label, re-computed whenever the view changes.
 *
 * @remarks It is an image named with the spoken scale ("Scale: 200 metres").
 *   It fades about two seconds after the zoom last changed and comes back on
 *   the next zoom, but never while the map has keyboard focus or the user
 *   asked for reduced motion. Its width changes through a CSS custom property
 *   and a transform, set with CSSOM so no `style` attribute is rendered.
 *   Reads the map with `useMap()`, so it must sit inside the map context.
 */
export function ScaleBar({ units }: ScaleBarProps) {
  const { adapter, view, hostElement } = useMap();
  const { reducedMotion } = usePreferences();
  const mapHasFocus = useMapHasKeyboardFocus(hostElement);
  const trackRef = useRef<HTMLDivElement>(null);
  const latitude = view.center.lat;
  const zoom = view.zoom;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the adapter object stays the same while the view moves, so the zoom is what makes its resolution change.
  const bar = useMemo(() => {
    if (!adapter) {
      return null;
    }
    // At the view centre a globe and a flat map share one scale: MapLibre
    // sizes the globe by 1 / cos(centre latitude) for exactly that reason
    // (`getGlobeRadiusPixels`), so the bar needs no globe case.
    return computeScaleBar({
      metresPerPixel: adapter.metresPerPixel(latitude),
      maxWidthPx: SCALE_BAR_MAX_WIDTH_PX,
      units,
    });
  }, [adapter, latitude, zoom, units]);

  const canFade = !reducedMotion && !mapHasFocus;
  const [idleAtZoom, setIdleAtZoom] = useState<number | null>(null);
  useEffect(() => {
    if (!canFade) {
      return;
    }
    const timer = setTimeout(() => {
      setIdleAtZoom(zoom);
    }, SCALE_BAR_IDLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [canFade, zoom]);
  const idle = canFade && idleAtZoom === zoom;

  const ratio = bar ? bar.widthPx / SCALE_BAR_MAX_WIDTH_PX : 0;
  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    track.style.setProperty("--scale-max", `${SCALE_BAR_MAX_WIDTH_PX}px`);
    track.style.setProperty("--scale-ratio", String(ratio));
  }, [ratio]);

  if (!bar) {
    return null;
  }
  return (
    <div
      role="img"
      aria-label={bar.accessibleLabel}
      data-chrome="scale-bar"
      data-idle={idle ? "true" : "false"}
      className={styles.scaleBar}
    >
      <span>{bar.label}</span>
      <div
        ref={trackRef}
        className={styles.track}
        data-testid="scale-bar-track"
      >
        <span className={styles.line} />
        <span className={styles.tickStart} />
        <span className={styles.tickEnd} />
      </div>
    </div>
  );
}

/** Props for {@link CursorCoordinates}. */
export interface CursorCoordinatesProps {
  /**
   * The position under the pointer, or null to show nothing. The app passes
   * null on touch devices, where there is no hovering pointer.
   */
  readonly latlng: LatLng | null;
}

/** The position under the pointer, as plain muted text with tabular figures. */
export function CursorCoordinates({ latlng }: CursorCoordinatesProps) {
  if (!latlng) {
    return null;
  }
  return (
    <p data-chrome="cursor-coordinates" className={styles.coordinates}>
      {formatLatLng(latlng)}
    </p>
  );
}

/** Props for {@link MapReadout}. */
export interface MapReadoutProps
  extends ScaleBarProps,
    CursorCoordinatesProps {}

/**
 * The bottom-start readout: the scale bar with the cursor coordinates under
 * it. One floating element, for the layout collision test, and a landmark
 * named "Map scale" so its content is inside a landmark.
 */
export function MapReadout({ units, latlng }: MapReadoutProps) {
  return (
    <section
      aria-label="Map scale"
      data-chrome="map-readout"
      data-testid="map-readout"
      className={styles.readout}
    >
      <ScaleBar units={units} />
      <CursorCoordinates latlng={latlng} />
    </section>
  );
}
