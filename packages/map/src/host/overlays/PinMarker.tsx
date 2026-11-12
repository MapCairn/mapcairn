// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type LatLng, placePoint } from "@mapcairn/core";
import { roundPixel, usePlacement } from "./geometry";
import * as styles from "./overlays.css";

/**
 * The pin shape, drawn with its tip at the origin so a translate puts the tip
 * on the point. Defined once; colours come from the overlay tokens.
 */
function PinGlyph() {
  return (
    <>
      <path
        className={styles.pinBody}
        d="M0 0 C-2 -7 -11 -13 -11 -23 A11 11 0 1 1 11 -23 C11 -13 2 -7 0 0 Z"
      />
      <circle className={styles.pinDot} cx={0} cy={-23} r={4} />
    </>
  );
}

/** Props for {@link PinMarker}. */
export interface PinMarkerProps {
  /** Where the pin's tip points. */
  readonly position: LatLng;
  readonly testId?: string;
}

/**
 * A dropped pin, drawn in the overlay layer and re-projected whenever the view
 * changes. It is not drawn while it is on the far side of a globe, and on a
 * flat map it is drawn on the copy of the world nearest the view centre.
 * Render it inside `MapOverlayLayer`.
 */
export function PinMarker({ position, testId }: PinMarkerProps) {
  const placement = usePlacement();
  const at = placement ? placePoint(position, placement) : null;
  if (!at) {
    return null;
  }
  const { x, y } = at;
  return (
    <g
      transform={`translate(${roundPixel(x)} ${roundPixel(y)})`}
      data-testid={testId}
    >
      <PinGlyph />
    </g>
  );
}
