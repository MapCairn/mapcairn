// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type LatLng, placePoint } from "@mapcairn/core";
import { useMap } from "../MapContext";
import { roundPixel, screenRadiusForMetres, usePlacement } from "./geometry";
import * as styles from "./overlays.css";

/**
 * The smallest radius drawn, so a very precise fix still shows a circle.
 *
 * @internal
 */
export const MIN_ACCURACY_RADIUS_PX = 8;

/** Props for {@link AccuracyCircle}. */
export interface AccuracyCircleProps {
  /** The fix's position, where the circle is centred. */
  readonly center: LatLng;
  /** The location's accuracy radius on the ground. */
  readonly accuracyMetres: number;
  /** Sets `data-testid` on the circle. */
  readonly testId?: string;
}

/**
 * The circle around a found location, sized from the ground resolution at its
 * latitude so it matches the real accuracy at every zoom (on a globe, the
 * resolution at the view centre, which holds across the sphere). The outline
 * has a halo under it, like a measure line, so it shows over any basemap.
 * Render it inside `MapOverlayLayer`.
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
  const cx = roundPixel(x);
  const cy = roundPixel(y);
  const r = roundPixel(radius);
  return (
    <>
      <circle
        className={styles.accuracyHalo}
        cx={cx}
        cy={cy}
        r={r}
        data-testid={testId === undefined ? undefined : `${testId}-halo`}
      />
      <circle
        className={styles.accuracy}
        cx={cx}
        cy={cy}
        r={r}
        data-testid={testId}
      />
    </>
  );
}
