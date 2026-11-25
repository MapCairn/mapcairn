// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type MapPlacement,
  type PixelPoint,
  type PlacedPath,
  placePath,
  placePoint,
  visibleRuns,
} from "@mapcairn/core";
import { useMap } from "../host";
import {
  roundPixel,
  toSvgPoints,
  usePlacement,
} from "../host/overlays/geometry";
import { boundsMeet } from "./boundsMeet";
import { nearestVisibleVertex } from "./highlightBadge";
import * as styles from "./Layers.css";
import { featureBounds, featureOutlines, featurePosition } from "./mapFeatures";
import { useSelection } from "./SelectionProvider";
import type { ShownSelection } from "./selectionResolve";

/** The most selected features drawn at once, so a large set stays cheap to redraw while the map moves. */
export const MAX_HIGHLIGHTED_FEATURES = 200;

/** The most vertices one ring or line of a highlighted outline keeps; lower than the open card's outline, because up to 200 are drawn. */
export const HIGHLIGHT_OUTLINE_POINTS = 100;

/** Radius of the ring round a selected point, in pixels; larger than the open card's ring so both read when one point is both. */
const POINT_RING_RADIUS_PX = 20;

/** Radius of a check badge, in pixels. */
const BADGE_RADIUS_PX = 8;

/** How far a point's badge sits right of and above its centre, in pixels. */
const POINT_BADGE_OFFSET_PX = 14;

/** The tick of a check badge, as a path round the badge's centre. */
const CHECK_PATH = "M-3.5 0.5 L-1 3 L3.5 -2.5";

function Badge({ at }: { at: PixelPoint }) {
  return (
    <g
      data-part="badge"
      transform={`translate(${roundPixel(at.x)} ${roundPixel(at.y)})`}
    >
      <circle className={styles.highlightBadge} r={BADGE_RADIUS_PX} />
      <path className={styles.highlightCheck} d={CHECK_PATH} />
    </g>
  );
}

/** One piece of an outline on its halo. Closed only when the whole ring is in sight. */
function Piece({
  points,
  closed,
}: {
  points: readonly PixelPoint[];
  closed: boolean;
}) {
  const Shape = closed ? "polygon" : "polyline";
  const svgPoints = toSvgPoints(points);
  return (
    <>
      <Shape
        data-part="halo"
        className={styles.highlightHalo}
        points={svgPoints}
      />
      <Shape
        data-part="outline"
        className={styles.highlightDashes}
        points={svgPoints}
      />
    </>
  );
}

function Outline({ path }: { path: PlacedPath }) {
  if (path.closed && path.whole) {
    return <Piece points={path.pixels} closed={true} />;
  }
  return (
    <>
      {visibleRuns(path).map((run, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the order is the identity.
        <Piece key={index} points={run} closed={false} />
      ))}
    </>
  );
}

interface HighlightProps {
  readonly entry: ShownSelection;
  readonly placement: MapPlacement;
  readonly centre: PixelPoint | null;
}

function PointHighlight({ entry, placement }: HighlightProps) {
  const position = featurePosition(entry.feature);
  const at = position ? placePoint(position, placement) : null;
  if (!at) {
    return null;
  }
  return (
    <g data-testid="selection-highlight" data-kind="point">
      <g transform={`translate(${roundPixel(at.x)} ${roundPixel(at.y)})`}>
        <circle
          className={styles.highlightHalo}
          r={POINT_RING_RADIUS_PX}
          data-part="halo"
        />
        <circle
          className={styles.highlightRing}
          r={POINT_RING_RADIUS_PX}
          data-part="ring"
        />
      </g>
      <Badge
        at={{
          x: at.x + POINT_BADGE_OFFSET_PX,
          y: at.y - POINT_BADGE_OFFSET_PX,
        }}
      />
    </g>
  );
}

function OutlineHighlight({ entry, placement, centre }: HighlightProps) {
  const paths = featureOutlines(entry.feature, HIGHLIGHT_OUTLINE_POINTS).map(
    ({ points, closed }) => placePath(points, closed, placement),
  );
  const badge = centre ? nearestVisibleVertex(paths, centre) : null;
  return (
    <g data-testid="selection-highlight" data-kind="outline">
      {paths.map((path, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the order is the identity.
        <Outline key={index} path={path} />
      ))}
      {badge ? <Badge at={badge} /> : null}
    </g>
  );
}

/**
 * Marks the features of the selected set on the map, so the set and the map
 * agree on what is chosen. A point gets a ring and a check badge. A line or
 * polygon gets a dashed outline on a halo (the open card's ring is solid) and a
 * badge on the vertex in sight nearest the centre of the view; with no vertex
 * in sight the outline alone shows. Colour is never the only signal.
 *
 * Render it inside `MapOverlayLayer`. It reads the set with `useSelection()` and
 * draws nothing without one. Marks are placed like the draw tool's, so the
 * nearest copy of the world, great-circle curves and the horizon of a globe
 * apply. At most {@link MAX_HIGHLIGHTED_FEATURES} features are drawn, each with
 * outlines thinned to {@link HIGHLIGHT_OUTLINE_POINTS} vertices, and only
 * those whose box meets the view. A reference that is not shown has no mark.
 * Like the card's ring, the marks are left out of a saved image.
 */
export function SelectionHighlights() {
  const selection = useSelection();
  const placement = usePlacement();
  const { adapter } = useMap();
  if (!selection || !placement || !adapter) {
    return null;
  }
  const view = adapter.getBounds();
  const centre = placement.isVisible(placement.view.center)
    ? placement.project(placement.view.center)
    : null;
  const inView: ShownSelection[] = [];
  for (const entry of selection.entries) {
    if (inView.length === MAX_HIGHLIGHTED_FEATURES) {
      break;
    }
    if (entry.status !== "shown") {
      continue;
    }
    const box = featureBounds(entry.feature);
    if (box && boundsMeet(view, box)) {
      inView.push(entry);
    }
  }
  return (
    <g data-testid="selection-highlights">
      {inView.map((entry) => {
        const Mark =
          entry.feature.geometry.type === "Point"
            ? PointHighlight
            : OutlineHighlight;
        return (
          <Mark
            key={`${entry.ref.layerId}\u0000${entry.ref.featureId}`}
            entry={entry}
            placement={placement}
            centre={centre}
          />
        );
      })}
    </g>
  );
}
