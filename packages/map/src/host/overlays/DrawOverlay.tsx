import {
  circleRing,
  type DrawSelection,
  type DrawShape,
  distanceMetres,
  type LatLng,
  type MapEditHandle,
  type PixelPoint,
  shapeRing,
} from "@mapcairn/core";
import { useMap } from "../MapContext";
import {
  type OverlayMap,
  type ProjectedPath,
  projectPath,
  roundPixel,
  toSvgPoints,
  visibleRuns,
} from "./geometry";
import * as styles from "./overlays.css";

/** Radius of a point shape's marker, in pixels. */
export const DRAW_POINT_RADIUS_PX = 7;

/** Radius of a vertex handle, in pixels. The press reaches further than this. */
export const DRAW_VERTEX_RADIUS_PX = 7;

/** Radius of the selected vertex's handle, in pixels, so it stands apart by size as well as fill. */
export const DRAW_SELECTED_VERTEX_RADIUS_PX = 10;

/** Radius of a midpoint handle, in pixels. */
export const DRAW_MIDPOINT_RADIUS_PX = 4;

/** Half the side of a circle's radius handle, in pixels. */
export const DRAW_RADIUS_HANDLE_HALF_PX = 7;

/** How many positions the preview ring of a circle being drawn has. */
const PREVIEW_RING_STEPS = 48;

/** Props for {@link DrawOverlay}. */
export interface DrawOverlayProps {
  /** Every shape, finished or being drawn. */
  readonly shapes: readonly DrawShape[];
  /** The selected shape and vertex. */
  readonly selection: DrawSelection | null;
  /**
   * The handles to draw, normally those of the selected shape. Leave empty
   * while the tool is closed, so finished shapes show with no handles.
   */
  readonly handles?: readonly MapEditHandle[];
  /** The handle a mouse is over, drawn larger. */
  readonly hoveredHandle?: string | null;
  /** The position under the pointer, for the dashed preview of the next edge. */
  readonly hover?: LatLng;
  readonly testId?: string;
}

/** A line with a halo beneath it, open or closed. */
function HaloPath({
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
 * An outline: the whole closed or open path while every point is in sight,
 * otherwise only the runs of visible points, each as an open line.
 */
function Outline({
  path,
  closed,
  className,
}: {
  path: ProjectedPath;
  closed: boolean;
  className: string;
}) {
  if (closed && path.whole) {
    return (
      <HaloPath points={path.pixels} closed={true} className={className} />
    );
  }
  return (
    <>
      {visibleRuns(path).map((run, index) => (
        <HaloPath
          // biome-ignore lint/suspicious/noArrayIndexKey: the order is the identity.
          key={index}
          points={run}
          closed={false}
          className={className}
        />
      ))}
    </>
  );
}

function shapeClass(shape: DrawShape, selected: boolean): string {
  if (!shape.done) {
    return styles.drawDraft;
  }
  return selected ? styles.drawLineSelected : styles.drawLine;
}

interface DrawnShapeProps {
  readonly shape: DrawShape;
  readonly selected: boolean;
  readonly map: OverlayMap;
}

/** One shape: its fill, outline and, for a point, its marker. */
function DrawnShape({ shape, selected, map }: DrawnShapeProps) {
  const className = shapeClass(shape, selected);
  const common = {
    "data-testid": "draw-shape",
    "data-shape-id": shape.id,
    "data-kind": shape.kind,
    "data-selected": selected ? "true" : "false",
    "data-done": shape.done ? "true" : "false",
  } as const;
  const first = shape.vertices[0];
  if (!first) {
    return null;
  }
  if (shape.kind === "point") {
    if (!map.isVisible(first)) {
      return null;
    }
    const at = map.project(first);
    return (
      <circle
        {...common}
        className={selected ? styles.drawPointSelected : styles.drawPoint}
        cx={roundPixel(at.x)}
        cy={roundPixel(at.y)}
        r={DRAW_POINT_RADIUS_PX}
      />
    );
  }
  if (shape.kind === "line") {
    const path = projectPath(map, shape.vertices);
    return path.pixels.length >= 2 ? (
      <g {...common}>
        <Outline path={path} closed={false} className={className} />
      </g>
    ) : null;
  }
  const ring = projectPath(map, shapeRing(shape));
  if (shape.kind === "circle") {
    return ring.pixels.length >= 3 ? (
      <g {...common}>
        {ring.whole ? (
          <polygon
            className={styles.drawFill}
            points={toSvgPoints(ring.pixels)}
          />
        ) : null}
        <Outline path={ring} closed={true} className={className} />
      </g>
    ) : null;
  }
  const path = projectPath(map, shape.vertices);
  if (path.pixels.length < 3) {
    return path.pixels.length === 2 ? (
      <g {...common}>
        <Outline path={path} closed={false} className={className} />
      </g>
    ) : null;
  }
  return (
    <g {...common}>
      {path.whole ? (
        <polygon
          className={styles.drawFill}
          points={toSvgPoints(path.pixels)}
        />
      ) : null}
      <Outline path={path} closed={true} className={className} />
    </g>
  );
}

/** The dashed edge from the last vertex of the shape being drawn to the pointer. */
function Preview({
  draft,
  hover,
  map,
}: {
  draft: DrawShape;
  hover: LatLng;
  map: OverlayMap;
}) {
  const last = draft.vertices.at(-1);
  const first = draft.vertices[0];
  if (!last || !first) {
    return null;
  }
  if (draft.kind === "circle") {
    const radius = distanceMetres(first, hover);
    return radius > 0 ? (
      <Outline
        path={projectPath(map, circleRing(first, radius, PREVIEW_RING_STEPS))}
        closed={true}
        className={styles.measurePreview}
      />
    ) : null;
  }
  const path =
    draft.kind === "polygon" && draft.vertices.length >= 2
      ? [last, hover, first]
      : [last, hover];
  return (
    <Outline
      path={projectPath(map, path)}
      closed={false}
      className={styles.measurePreview}
    />
  );
}

interface HandleProps {
  readonly handle: MapEditHandle;
  readonly at: PixelPoint;
  readonly selected: boolean;
  readonly hovered: boolean;
}

/** One handle: a circle for a vertex, a small one for a midpoint and a square for a radius. */
function Handle({ handle, at, selected, hovered }: HandleProps) {
  const common = {
    "data-testid": "draw-handle",
    "data-handle-id": handle.id,
    "data-handle-kind": handle.kind,
    "data-selected": selected ? "true" : "false",
    "data-hovered": hovered ? "true" : "false",
  } as const;
  const cx = roundPixel(at.x);
  const cy = roundPixel(at.y);
  if (handle.kind === "radius") {
    const half = DRAW_RADIUS_HANDLE_HALF_PX + (hovered ? 2 : 0);
    return (
      <rect
        {...common}
        className={styles.drawRadiusHandle}
        x={cx - half}
        y={cy - half}
        width={half * 2}
        height={half * 2}
      />
    );
  }
  if (handle.kind === "midpoint") {
    return (
      <circle
        {...common}
        className={styles.drawMidpoint}
        cx={cx}
        cy={cy}
        r={DRAW_MIDPOINT_RADIUS_PX + (hovered ? 2 : 0)}
      />
    );
  }
  const base = selected
    ? DRAW_SELECTED_VERTEX_RADIUS_PX
    : DRAW_VERTEX_RADIUS_PX;
  return (
    <circle
      {...common}
      className={selected ? styles.drawVertexSelected : styles.drawVertex}
      cx={cx}
      cy={cy}
      r={base + (hovered ? 2 : 0)}
    />
  );
}

function selectedHandle(
  handle: MapEditHandle,
  selection: DrawSelection | null,
): boolean {
  return (
    selection !== null &&
    selection.vertex !== null &&
    handle.id === `${selection.shapeId}:v:${selection.vertex}`
  );
}

/**
 * The draw tool's drawing: every shape with its fill and outline, the
 * unfinished one dashed, the selected one drawn heavier, a dashed preview of
 * the next edge, and the handles of the selected shape. Render it inside
 * `MapOverlayLayer`.
 *
 * @remarks On a globe, nothing beyond the horizon is drawn: a point, a handle
 *   or a segment with an end there is left out, and a closed shape's fill is
 *   drawn only while every vertex is in sight. Segments between visible
 *   points are straight on the screen, not curved along the globe.
 *   Selection is shown by weight, handles and a filled vertex as well
 *   as colour. The layer never takes the pointer: the adapter owns the press
 *   on a handle, and this only draws where the handles are.
 */
export function DrawOverlay({
  shapes,
  selection,
  handles = [],
  hoveredHandle = null,
  hover,
  testId,
}: DrawOverlayProps) {
  const { adapter } = useMap();
  if (!adapter) {
    return null;
  }
  const draft = shapes.find((shape) => !shape.done);
  const ordered = [
    ...shapes.filter((shape) => shape.id !== selection?.shapeId),
    ...shapes.filter((shape) => shape.id === selection?.shapeId),
  ];
  const placed = projectPath(
    adapter,
    handles.map((handle) => handle.position),
  );
  return (
    <g data-testid={testId}>
      {ordered.map((shape) => (
        <DrawnShape
          key={shape.id}
          shape={shape}
          selected={shape.id === selection?.shapeId}
          map={adapter}
        />
      ))}
      {draft && hover ? (
        <Preview draft={draft} hover={hover} map={adapter} />
      ) : null}
      {handles.map((handle, index) =>
        placed.visible[index] ? (
          <Handle
            key={handle.id}
            handle={handle}
            at={placed.pixels[index] as PixelPoint}
            selected={selectedHandle(handle, selection)}
            hovered={handle.id === hoveredHandle}
          />
        ) : null,
      )}
    </g>
  );
}
