import type { LatLng } from "@karta/core";
import { useMap } from "../MapContext";
import { roundPixel } from "./geometry";
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
 * changes. Render it inside `MapOverlayLayer`.
 */
export function PinMarker({ position, testId }: PinMarkerProps) {
  const { adapter } = useMap();
  if (!adapter) {
    return null;
  }
  const { x, y } = adapter.project(position);
  return (
    <g
      transform={`translate(${roundPixel(x)} ${roundPixel(y)})`}
      data-testid={testId}
    >
      <PinGlyph />
    </g>
  );
}
