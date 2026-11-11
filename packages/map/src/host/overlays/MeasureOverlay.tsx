import type { LatLng, PixelPoint } from "@mapcairn/core";
import { useMap } from "../MapContext";
import { projectPath, roundPixel, toSvgPoints, visibleRuns } from "./geometry";
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
 * @remarks On a globe, a vertex beyond the horizon is not drawn, and neither
 *   is a segment that ends at one. The fill and the closing edge of an area
 *   are drawn only while every vertex is in sight.
 */
export function MeasureOverlay({
  points,
  mode,
  hover,
  testId,
}: MeasureOverlayProps) {
  const { adapter } = useMap();
  if (!adapter) {
    return null;
  }
  const path = projectPath(adapter, points);
  const { pixels } = path;
  const hoverPixel =
    hover && adapter.isVisible(hover) ? adapter.project(hover) : null;
  const area = mode === "area";
  const closed = area && pixels.length >= 3 && path.whole;
  const fillPoints = hoverPixel ? [...pixels, hoverPixel] : pixels;
  const last = pixels.at(-1);
  const first = pixels[0];
  const endsInSight = path.visible.at(-1) === true && path.visible[0] === true;
  const preview =
    hoverPixel && last && first && endsInSight
      ? area && pixels.length >= 2
        ? [last, hoverPixel, first]
        : [last, hoverPixel]
      : null;
  const lines = closed ? [pixels] : visibleRuns(path);

  return (
    <g data-testid={testId} data-mode={mode}>
      {area && path.whole && fillPoints.length >= 3 ? (
        <polygon
          className={styles.measureFill}
          points={toSvgPoints(fillPoints)}
        />
      ) : null}
      {lines.map((line, index) => (
        <HaloLine
          // biome-ignore lint/suspicious/noArrayIndexKey: the order is the identity.
          key={index}
          points={line}
          closed={closed}
          className={styles.measureLine}
        />
      ))}
      {preview ? (
        <HaloLine
          points={preview}
          closed={false}
          className={styles.measurePreview}
        />
      ) : null}
      {pixels.map((pixel, index) =>
        path.visible[index] ? (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: the order is the identity.
            key={index}
            className={styles.measureVertex}
            cx={roundPixel(pixel.x)}
            cy={roundPixel(pixel.y)}
            r={MEASURE_VERTEX_RADIUS_PX}
          />
        ) : null,
      )}
    </g>
  );
}
