// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type LatLng, placePoint } from "@mapcairn/core";
import { useMap } from "../MapContext";
import { roundPixel, screenRadiusForMetres, usePlacement } from "./geometry";
import * as styles from "./overlays.css";

/** The smallest radius drawn, so a very precise fix still shows a circle. */
export const MIN_ACCURACY_RADIUS_PX = 8;

/** Props for {@link AccuracyCircle}. */
export interface AccuracyCircleProps {
  readonly center: LatLng;
  /** The location's accuracy radius on the ground. */
  readonly accuracyMetres: number;
  readonly testId?: string;
}

/**
 * The circle around a found location, sized from the ground resolution at its
 * latitude so it matches the real accuracy at every zoom (on a globe, the
 * resolution at the view centre, which holds across the sphere). Render it
 * inside `MapOverlayLayer`.
 */
export function AccuracyCircle({
  center,
  accuracyMetres,
  testId,
}: AccuracyCircleProps) {
  const { adapter } = useMap();
  const placement = usePlacement();
  const at = placement ? placePoint(center, placement) : null;
  if (!adapter || !at) {
    return null;
  }
  const { x, y } = at;
  const radius = screenRadiusForMetres(
    accuracyMetres,
    adapter.metresPerPixel(center.lat),
    MIN_ACCURACY_RADIUS_PX,
  );
  return (
    <circle
      className={styles.accuracy}
      cx={roundPixel(x)}
      cy={roundPixel(y)}
      r={roundPixel(radius)}
      data-testid={testId}
    />
  );
}
