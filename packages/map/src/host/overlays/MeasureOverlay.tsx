import type { LatLng, PixelPoint } from "@karta/core";
import { useMap } from "../MapContext";
import { projectPoints, roundPixel, toSvgPoints } from "./geometry";
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
  const pixels = projectPoints(adapter, points);
  const hoverPixel = hover ? adapter.project(hover) : null;
  const area = mode === "area";
  const closed = area && pixels.length >= 3;
  const fillPoints = hoverPixel ? [...pixels, hoverPixel] : pixels;
  const last = pixels.at(-1);
  const first = pixels[0];
  const preview =
    hoverPixel && last && first
      ? area && pixels.length >= 2
        ? [last, hoverPixel, first]
        : [last, hoverPixel]
      : null;

  return (
    <g data-testid={testId} data-mode={mode}>
      {area && fillPoints.length >= 3 ? (
        <polygon
          className={styles.measureFill}
          points={toSvgPoints(fillPoints)}
        />
      ) : null}
      {pixels.length >= 2 ? (
        <HaloLine
          points={pixels}
          closed={closed}
          className={styles.measureLine}
        />
      ) : null}
      {preview ? (
        <HaloLine
          points={preview}
          closed={false}
          className={styles.measurePreview}
        />
      ) : null}
      {pixels.map((pixel, index) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: the order is the identity.
          key={index}
          className={styles.measureVertex}
          cx={roundPixel(pixel.x)}
          cy={roundPixel(pixel.y)}
          r={MEASURE_VERTEX_RADIUS_PX}
        />
      ))}
    </g>
  );
}
