// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type LatLng,
  type PixelPoint,
  placePath,
  visibleRuns,
} from "@mapcairn/core";
import { roundPixel, toSvgPoints, usePlacement } from "./geometry";
import * as styles from "./overlays.css";

/** Radius of a measure vertex, in pixels. */
export const MEASURE_VERTEX_RADIUS_PX = 5;

/** Props for {@link MeasureOverlay}. */
export interface MeasureOverlayProps {
  /** The committed points, in the order they were added. */
  readonly points: readonly LatLng[];
  /** A distance is an open line; an area is a closed, filled polygon. */
  readonly mode: "distance" | "area";
  /** The point under the pointer, drawn as a dashed preview to the last point. */
  readonly hover?: LatLng;
  readonly testId?: string;
}

/** A line with a halo beneath it, open or closed. */
function HaloLine({
  points,
  closed,
  className,
}: {
  points: readonly PixelPoint[];
  closed: boolean;
  className: string;
}) {
  const Shape = closed ? "polygon" : "polyline";
  const svgPoints = toSvgPoints(points);
  return (
    <>
      <Shape className={styles.measureHalo} points={svgPoints} />
      <Shape className={className} points={svgPoints} />
    </>
  );
}

/**
 * The measuring tool's drawing: vertices, the line between them and, for an
 * area, the closed polygon and its fill. Render it inside `MapOverlayLayer`.
 * @remarks Segments go the short way across the antimeridian. On a globe each
 *   segment follows its great circle, the path the measured distance runs
 *   along, and stops at the horizon: a vertex beyond it is not drawn, and the
 *   fill and the closing edge of an area are drawn whole only while all of
 *   the outline is in sight.
 */
export function MeasureOverlay({
  points,
  mode,
  hover,
  testId,
}: MeasureOverlayProps) {
  const placement = usePlacement();
  if (!placement) {
    return null;
  }
  const area = mode === "area";
  const path = placePath(points, area && points.length >= 3, placement);
  const filled = area && path.whole && points.length >= 2;
  const fill =
    filled && hover
      ? placePath([...points, hover], true, placement)
      : filled
        ? path
        : null;
  const last = points.at(-1);
  const first = points[0];
  const preview =
    hover && last && first
      ? placePath(
          area && points.length >= 2 ? [last, hover, first] : [last, hover],
          false,
          placement,
        )
      : null;
  const lines =
    path.closed && path.whole
      ? [{ points: path.pixels, closed: true }]
      : visibleRuns(path).map((run) => ({ points: run, closed: false }));

  return (
    <g data-testid={testId} data-mode={mode}>
      {fill?.whole && fill.pixels.length >= 3 ? (
        <polygon
          className={styles.measureFill}
          points={toSvgPoints(fill.pixels)}
        />
      ) : null}
      {lines.map((line, index) => (
        <HaloLine
          // biome-ignore lint/suspicious/noArrayIndexKey: the order is the identity.
          key={index}
          points={line.points}
          closed={line.closed}
          className={styles.measureLine}
        />
      ))}
      {preview
        ? visibleRuns(preview).map((run, index) => (
            <HaloLine
              // biome-ignore lint/suspicious/noArrayIndexKey: the order is the identity.
              key={`preview-${index}`}
              points={run}
              closed={false}
              className={styles.measurePreview}
            />
          ))
        : null}
      {path.vertices.map((pixelIndex, index) => {
        const at = path.visible[pixelIndex] ? path.pixels[pixelIndex] : null;
        return at ? (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: the order is the identity.
            key={index}
            className={styles.measureVertex}
            cx={roundPixel(at.x)}
            cy={roundPixel(at.y)}
            r={MEASURE_VERTEX_RADIUS_PX}
          />
        ) : null;
      })}
    </g>
  );
}
