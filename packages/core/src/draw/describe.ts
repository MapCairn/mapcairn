// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatNumber } from "../format/format";
import { SUPPORTED_WKT_SRID } from "../geometry/wkt";
import type { UnitSystem } from "../ports/settings";
import {
  describeArea,
  describeDistance,
  formatArea,
  formatDistance,
  pluralise,
} from "../units/measurement";
import {
  MAX_DRAWING_SHAPES,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_POINTS,
  MAX_IMPORT_SHAPE_POINTS,
  MAX_IMPORT_SHAPES,
  type ShapeImport,
  type ShapeImportRefusal,
  type ShapeImportSkip,
} from "./import";
import type { DrawEvent } from "./reducer";
import { kindName, measureShape } from "./shape";
import type { DrawIssue, DrawKind, DrawShape } from "./types";

/*
 * Every string the draw tool shows or announces lives here, so the wording is
 * reviewed in one place and tests can pin it. Plain British English, each
 * refusal saying what to do next.
 */

/** What to do about each reason a shape or an edit was refused. */
export const DRAW_ISSUE_MESSAGES: Readonly<Record<DrawIssue, string>> = {
  "too-few-vertices":
    "Not enough points yet. A line needs two points and a polygon needs three.",
  "self-intersecting":
    "The edges cross each other. Move a point so they do not, then finish.",
  degenerate:
    "That would have no size. Choose a place further from the others.",
  "radius-missing": "Tap a second point to set the circle's radius.",
  "radius-too-large": "That radius is too large. The most is 10,000 km.",
};

const HINTS: Readonly<Record<DrawKind, string>> = {
  point: "Tap the map to place a point, or use Add point at map centre.",
  line: "Tap the map to add points, then Finish. Or use Add point at map centre.",
  polygon:
    "Tap the map to add corners, then Finish. Or use Add point at map centre.",
  circle:
    "Tap the centre, then a second point to set the radius. Or use Add point at map centre.",
};

/** The instruction shown under the toolbar for a drawing mode. */
export function hintFor(kind: DrawKind): string {
  return HINTS[kind];
}

/**
 * A shape's measures as short text for the readout, for example
 * "1.2 ha · 480 m", "850 m", or "500 m radius · 78.5 ha" for a circle. Empty
 * for a point and for a shape with nothing to measure yet.
 */
export function formatShapeMeasure(
  shape: DrawShape,
  units: UnitSystem,
): string {
  const { areaMetres, lengthMetres } = measureShape(shape);
  if (shape.kind === "circle") {
    return shape.radiusMetres === undefined || areaMetres === null
      ? ""
      : `${formatDistance(shape.radiusMetres, units)} radius · ${formatArea(areaMetres, units)}`;
  }
  const parts: string[] = [];
  if (areaMetres !== null) {
    parts.push(formatArea(areaMetres, units));
  }
  if (lengthMetres !== null) {
    parts.push(formatDistance(lengthMetres, units));
  }
  return parts.join(" · ");
}

/**
 * A shape's measures in words for a screen reader, for example "area 1.2
 * hectares, perimeter 480 metres". Empty for a point.
 */
export function describeShapeMeasure(
  shape: DrawShape,
  units: UnitSystem,
): string {
  const { areaMetres, lengthMetres } = measureShape(shape);
  if (shape.kind === "circle") {
    return shape.radiusMetres === undefined || areaMetres === null
      ? ""
      : `radius ${describeDistance(shape.radiusMetres, units)}, area ${describeArea(areaMetres, units)}`;
  }
  if (shape.kind === "line") {
    return lengthMetres === null
      ? ""
      : `length ${describeDistance(lengthMetres, units)}`;
  }
  if (areaMetres === null) {
    return "";
  }
  const area = `area ${describeArea(areaMetres, units)}`;
  return lengthMetres === null
    ? area
    : `${area}, perimeter ${describeDistance(lengthMetres, units)}`;
}

function sentence(measure: string): string {
  return measure === ""
    ? ""
    : ` ${measure.charAt(0).toUpperCase()}${measure.slice(1)}.`;
}

function points(count: number): string {
  return `${count} ${pluralise(count, ["point", "points"])}`;
}

function shapeCount(count: number): string {
  return `${count} ${pluralise(count, ["shape", "shapes"])}`;
}

function describeSelection(shape: DrawShape, vertex: number | null): string {
  if (vertex !== null && (shape.kind === "line" || shape.kind === "polygon")) {
    return `Point ${vertex + 1} of ${shape.vertices.length} selected in ${shape.label}.`;
  }
  if (shape.kind === "line" || shape.kind === "polygon") {
    return `${shape.label} selected. ${points(shape.vertices.length)}.`;
  }
  return `${shape.label} selected.`;
}

function describeFinished(shape: DrawShape, units: UnitSystem): string {
  if (shape.kind === "point") {
    return `${shape.label} added.`;
  }
  return `${shape.label} finished.${sentence(describeShapeMeasure(shape, units))}`;
}

function describeMove(
  shape: DrawShape,
  index: number,
  units: UnitSystem,
): string {
  const measure = sentence(describeShapeMeasure(shape, units));
  if (shape.kind === "circle") {
    return `${shape.label} changed.${measure}`;
  }
  if (shape.kind === "point") {
    return `${shape.label} moved.`;
  }
  return `Point ${index + 1} of ${shape.label} moved.${measure}`;
}

/**
 * The words for what the last draw action did, or null when it needs none
 * (a mode change is visible on the switch itself). Wording is read from the
 * shapes as they are now, so a move reports the new measures.
 */
export function announceDrawEvent(
  event: DrawEvent | null,
  shapes: readonly DrawShape[],
  units: UnitSystem,
): string | null {
  if (!event || event.type === "mode") {
    return null;
  }
  const shape =
    "shapeId" in event
      ? shapes.find((candidate) => candidate.id === event.shapeId)
      : undefined;
  switch (event.type) {
    case "vertex-added":
      return shape
        ? `Point ${event.count} added to ${shape.label}.${sentence(describeShapeMeasure(shape, units))}`
        : `Point ${event.count} added.`;
    case "vertex-moved":
      return shape ? describeMove(shape, event.index, units) : null;
    case "vertex-inserted":
      return shape
        ? `Point added to ${shape.label} as point ${event.index + 1} of ${event.count}.`
        : null;
    case "vertex-removed":
      return shape
        ? `Point removed from ${shape.label}. ${event.count} ${pluralise(event.count, ["point", "points"])} left.`
        : null;
    case "finished":
      return shape ? describeFinished(shape, units) : null;
    case "selected":
      return shape ? describeSelection(shape, event.vertex) : null;
    case "discarded":
      return `Discarded the unfinished ${kindName(event.kind).toLowerCase()}.`;
    case "rejected":
      return DRAW_ISSUE_MESSAGES[event.issue];
    case "deleted":
      return `Deleted ${event.label}. Undo brings it back.`;
    case "cleared":
      return event.count === 1
        ? "Deleted 1 shape."
        : `Deleted all ${event.count} shapes.`;
    case "undone":
      return "Undone.";
    case "redone":
      return "Redone.";
    case "loaded":
      return `${shapeCount(event.count)} loaded from the link.`;
    case "imported":
      // The import's own result says what it added and what it skipped.
      return null;
  }
}

const BYTES_PER_MEGABYTE = 1_000_000;

const IMPORT_REFUSALS: Readonly<Record<ShapeImportRefusal, string>> = {
  "drawing-full": `That would make more than ${formatNumber(MAX_DRAWING_SHAPES)} shapes. Delete some shapes first, or import a smaller file.`,
  empty: "The file is empty.",
  "too-large": `The file is larger than ${formatNumber(MAX_IMPORT_BYTES / BYTES_PER_MEGABYTE)} MB. Split it into smaller files.`,
  "too-deep":
    "The file is nested too deeply to read. Check that it is GeoJSON.",
  "not-recognised":
    "This is not GeoJSON, WKT or a CSV of shapes from this map. Choose a .geojson, .json, .wkt, .txt or .csv file.",
  "wkt-unreadable":
    "The WKT could not be read, so none of the file was imported.",
  "too-many-shapes": `The file holds more than ${formatNumber(MAX_IMPORT_SHAPES)} shapes. Import at most ${formatNumber(MAX_IMPORT_SHAPES)} at a time.`,
  "too-many-points": `The file holds more than ${formatNumber(MAX_IMPORT_POINTS)} points. Simplify the shapes or split the file.`,
};

/** What each skipped shape had wrong, after its count: "2 with edges that cross". */
const IMPORT_SKIPS: Readonly<Record<ShapeImportSkip, string>> = {
  "self-intersecting": "with edges that cross",
  degenerate: "with no length or area",
  "too-few-vertices": "with too few points",
  "radius-missing": "with no radius",
  "radius-too-large": "with a radius over 10,000 km",
  "out-of-range": "with a position outside the world",
  "too-many-points": `with more than ${formatNumber(MAX_IMPORT_SHAPE_POINTS)} points`,
  malformed: "with coordinates that could not be read",
  unsupported: "of a type that cannot be drawn",
  "other-srid": `in a coordinate system other than SRID ${SUPPORTED_WKT_SRID}`,
};

function describeSkips(
  skipped: Readonly<Partial<Record<ShapeImportSkip, number>>>,
): string {
  const parts: string[] = [];
  let total = 0;
  for (const [reason, words] of Object.entries(IMPORT_SKIPS)) {
    const count = skipped[reason as ShapeImportSkip] ?? 0;
    if (count > 0) {
      parts.push(`${count} ${words}`);
      total += count;
    }
  }
  return total === 0 ? "" : ` ${total} skipped: ${parts.join(", ")}.`;
}

/**
 * The words for what a file held, shown beside the Import button and
 * announced: how many shapes were imported, how many were skipped and why,
 * and whether holes were left out; or why the whole file was refused and
 * what to do instead.
 */
export function describeShapeImport(result: ShapeImport): string {
  if (!result.ok) {
    const refusal = IMPORT_REFUSALS[result.refusal];
    return result.detail === undefined
      ? refusal
      : `${refusal} ${result.detail}`;
  }
  const skips = describeSkips(result.skipped);
  if (result.shapes.length === 0 && skips === "") {
    return "The file holds no shapes.";
  }
  const imported =
    result.shapes.length === 0
      ? "No shapes imported."
      : `${shapeCount(result.shapes.length)} imported.`;
  const holes =
    result.holesDropped > 0
      ? ` Holes in ${result.holesDropped} ${pluralise(result.holesDropped, ["polygon", "polygons"])} were left out.`
      : "";
  return `${imported}${skips}${holes}`;
}
