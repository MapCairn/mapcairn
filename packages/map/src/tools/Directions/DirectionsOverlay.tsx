import { type DirectionStop, stopLetter } from "@mapcairn/core";
import { useMap } from "../../host";
import { CentreCrosshair } from "../../host/overlays/CentreCrosshair";
import { roundPixel } from "../../host/overlays/geometry";
import * as styles from "./Directions.css";
import { useFreeCentre } from "./useFreeCentre";

/** Radius of a stop's disc, in pixels. */
export const STOP_DISC_RADIUS_PX = 12;

/** Props for {@link DirectionsOverlay}. */
export interface DirectionsOverlayProps {
  /** The stops, in order. Each is drawn as a lettered disc. */
  readonly stops: readonly DirectionStop[];
  /**
   * Draws a crosshair where "Add stop at map centre" will put a stop, which
   * is the middle of the part of the map the panel leaves free.
   */
  readonly showCrosshair: boolean;
  readonly testId?: string;
}

/**
 * The stops of a set of directions, drawn as lettered discs, and the crosshair
 * that shows where the next stop goes when it is added at the map centre.
 * Render it inside `MapOverlayLayer`. Like every overlay it is a picture of
 * state the panel gives in words, and the letters mean it never depends on
 * colour.
 */
export function DirectionsOverlay({
  stops,
  showCrosshair,
  testId,
}: DirectionsOverlayProps) {
  const { adapter } = useMap();
  const { pixel } = useFreeCentre();
  if (!adapter) {
    return null;
  }
  return (
    <g data-testid={testId}>
      {stops.map((stop, index) => {
        if (!adapter.isVisible(stop.position)) {
          return null;
        }
        const { x, y } = adapter.project(stop.position);
        return (
          <g
            key={stop.id}
            transform={`translate(${roundPixel(x)} ${roundPixel(y)})`}
            data-testid="directions-stop"
          >
            <circle className={styles.stopDisc} r={STOP_DISC_RADIUS_PX} />
            <text className={styles.stopLetter}>{stopLetter(index)}</text>
          </g>
        );
      })}
      {showCrosshair && pixel ? (
        <CentreCrosshair at={pixel} testId="directions-crosshair" />
      ) : null}
    </g>
  );
}
