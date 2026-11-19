// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatLocale } from "../format/format";
import { SUPPORTED_WKT_SRID, type WktAxisOrder } from "../geometry/wkt";
import {
  appendMessages,
  joinMessages,
  message,
} from "../messages/formatMessage";
import type { Message, MessageCatalogue } from "../ports/messages";
import type { UnitSystem } from "../ports/settings";
import {
  describeArea,
  describeDistance,
  formatArea,
  formatDistance,
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
import { measureShape } from "./shape";
import type { DrawIssue, DrawKind, DrawShape } from "./types";

/*
 * Every piece of text the draw tool shows or announces is a message here (a
 * key and its parameters), so the wording lives in the catalogue, is reviewed
 * in one place and can be translated. The English is in `messages/en-GB.ts`;
 * plain British English, each refusal saying what to do next.
 */

/** What to do about each reason a shape or an edit was refused. */
export const DRAW_ISSUE_MESSAGES = {
  "too-few-vertices": message("draw.issue.too-few-vertices", {}),
  "self-intersecting": message("draw.issue.self-intersecting", {}),
  degenerate: message("draw.issue.degenerate", {}),
  "radius-missing": message("draw.issue.radius-missing", {}),
  "radius-too-large": message("draw.issue.radius-too-large", {}),
} as const satisfies Readonly<Record<DrawIssue, Message>>;

const HINTS = {
  point: message("draw.hint.point", {}),
  line: message("draw.hint.line", {}),
  polygon: message("draw.hint.polygon", {}),
  circle: message("draw.hint.circle", {}),
} as const satisfies Readonly<Record<DrawKind, Message>>;

const DISCARDED = {
  point: message("draw.discarded.point", {}),
  line: message("draw.discarded.line", {}),
  polygon: message("draw.discarded.polygon", {}),
  circle: message("draw.discarded.circle", {}),
} as const satisfies Readonly<Record<DrawKind, Message>>;

/** The instruction shown under the toolbar for a drawing mode. */
export function hintFor(kind: DrawKind): Message {
  return HINTS[kind];
}

/**
 * A shape's measures as short text for the readout, for example
 * "1.2 ha · 480 m", "850 m", or "500 m radius · 78.5 ha" for a circle. Empty
 * for a point and for a shape with nothing to measure yet. Figures are written
 * for the language of `messages`, and "radius" is its word.
 */
export function formatShapeMeasure(
  shape: DrawShape,
  units: UnitSystem,
  messages: MessageCatalogue,
): string {
  const { areaMetres, lengthMetres } = measureShape(shape);
  const locale = formatLocale(messages);
  if (shape.kind === "circle") {
    return shape.radiusMetres === undefined || areaMetres === null
      ? ""
      : messages.t("draw.measure.radiusAndArea", {
          radius: formatDistance(shape.radiusMetres, units, locale),
          area: formatArea(areaMetres, units, locale),
        });
  }
  const parts: string[] = [];
  if (areaMetres !== null) {
    parts.push(formatArea(areaMetres, units, locale));
  }
  if (lengthMetres !== null) {
    parts.push(formatDistance(lengthMetres, units, locale));
  }
  const [first, second] = parts;
  if (first === undefined || second === undefined) {
    return first ?? "";
  }
  return messages.t("common.dotJoined", { first, second });
}

/**
 * A shape's measures in words for a screen reader, for example "area 1.2
 * hectares, perimeter 480 metres". Null for a point.
 */
export function describeShapeMeasure(
  shape: DrawShape,
  units: UnitSystem,
): Message | null {
  const { areaMetres, lengthMetres } = measureShape(shape);
  if (shape.kind === "circle") {
    return shape.radiusMetres === undefined || areaMetres === null
      ? null
      : message("draw.measure.circle", {
          radius: describeDistance(shape.radiusMetres, units),
          area: describeArea(areaMetres, units),
        });
  }
  if (shape.kind === "line") {
    return lengthMetres === null
      ? null
      : message("draw.measure.line", {
          length: describeDistance(lengthMetres, units),
        });
  }
  if (areaMetres === null) {
    return null;
  }
  return lengthMetres === null
    ? message("draw.measure.polygonArea", {
        area: describeArea(areaMetres, units),
      })
    : message("draw.measure.polygon", {
        area: describeArea(areaMetres, units),
        perimeter: describeDistance(lengthMetres, units),
      });
}

/** The measures of a shape as a sentence that follows another, or null when there are none. */
function measureSentence(shape: DrawShape, units: UnitSystem): Message | null {
  const { areaMetres, lengthMetres } = measureShape(shape);
  if (shape.kind === "circle") {
    return shape.radiusMetres === undefined || areaMetres === null
      ? null
      : message("draw.sentence.circle", {
          radius: describeDistance(shape.radiusMetres, units),
          area: describeArea(areaMetres, units),
        });
  }
  if (shape.kind === "line") {
    return lengthMetres === null
      ? null
      : message("draw.sentence.line", {
          length: describeDistance(lengthMetres, units),
        });
  }
  if (areaMetres === null) {
    return null;
  }
  return lengthMetres === null
    ? message("draw.sentence.polygonArea", {
        area: describeArea(areaMetres, units),
      })
    : message("draw.sentence.polygon", {
        area: describeArea(areaMetres, units),
        perimeter: describeDistance(lengthMetres, units),
      });
}

function describeSelection(shape: DrawShape, vertex: number | null): Message {
  if (vertex !== null && (shape.kind === "line" || shape.kind === "polygon")) {
    return message("draw.vertexSelected", {
      index: vertex + 1,
      count: shape.vertices.length,
      label: shape.label,
    });
  }
  if (shape.kind === "line" || shape.kind === "polygon") {
    return message("draw.pathSelected", {
      label: shape.label,
      count: shape.vertices.length,
    });
  }
  return message("draw.shapeSelected", { label: shape.label });
}

function describeFinished(shape: DrawShape, units: UnitSystem): Message {
  if (shape.kind === "point") {
    return message("draw.pointAdded", { label: shape.label });
  }
  return appendMessages(message("draw.finished", { label: shape.label }), [
    measureSentence(shape, units),
  ]);
}

function describeMove(
  shape: DrawShape,
  index: number,
  units: UnitSystem,
): Message {
  const measure = measureSentence(shape, units);
  if (shape.kind === "circle") {
    return appendMessages(
      message("draw.circleChanged", { label: shape.label }),
      [measure],
    );
  }
  if (shape.kind === "point") {
    return message("draw.pointMoved", { label: shape.label });
  }
  return appendMessages(
    message("draw.vertexMoved", { index: index + 1, label: shape.label }),
    [measure],
  );
}

/**
 * The message for what the last draw action did, or null when it needs none
 * (a mode change is visible on the switch itself). Wording is read from the
 * shapes as they are now, so a move reports the new measures.
 */
export function announceDrawEvent(
  event: DrawEvent | null,
  shapes: readonly DrawShape[],
  units: UnitSystem,
): Message | null {
  if (!event) {
    return null;
  }
  const shape =
    "shapeId" in event
      ? shapes.find((candidate) => candidate.id === event.shapeId)
      : undefined;
  switch (event.type) {
    case "vertex-added":
      return shape
        ? appendMessages(
            message("draw.vertexAddedTo", {
              count: event.count,
              label: shape.label,
            }),
            [measureSentence(shape, units)],
          )
        : message("draw.vertexAdded", { count: event.count });
    case "vertex-moved":
      return shape ? describeMove(shape, event.index, units) : null;
    case "vertex-inserted":
      return shape
        ? message("draw.vertexInserted", {
            label: shape.label,
            index: event.index + 1,
            count: event.count,
          })
        : null;
    case "vertex-removed":
      return shape
        ? message("draw.vertexRemoved", {
            label: shape.label,
            count: event.count,
          })
        : null;
    case "finished":
      return shape ? describeFinished(shape, units) : null;
    case "selected":
      return shape ? describeSelection(shape, event.vertex) : null;
    case "discarded":
      return DISCARDED[event.kind];
    case "rejected":
      return DRAW_ISSUE_MESSAGES[event.issue];
    case "deleted":
      return message("draw.deleted", { label: event.label });
    case "cleared":
      return event.count === 1
        ? message("draw.clearedOne", {})
        : message("draw.clearedAll", { count: event.count });
    case "undone":
      return message("draw.undone", {});
    case "redone":
      return message("draw.redone", {});
    case "loaded":
      return message("draw.loaded", { count: event.count });
    case "mode":
    case "imported":
      // A mode change is visible on the switch itself, and the import's own
      // result says what it added and what it skipped.
      return null;
  }
}

const BYTES_PER_MEGABYTE = 1_000_000;

/** Why a whole file was refused, each with what to do instead. */
function describeRefusal(refusal: ShapeImportRefusal): Message {
  switch (refusal) {
    case "drawing-full":
      return message("draw.import.refusal.drawing-full", {
        max: MAX_DRAWING_SHAPES,
      });
    case "empty":
      return message("draw.import.refusal.empty", {});
    case "too-large":
      return message("draw.import.refusal.too-large", {
        megabytes: MAX_IMPORT_BYTES / BYTES_PER_MEGABYTE,
      });
    case "too-deep":
      return message("draw.import.refusal.too-deep", {});
    case "not-recognised":
      return message("draw.import.refusal.not-recognised", {});
    case "wkt-unreadable":
      return message("draw.import.refusal.wkt-unreadable", {});
    case "too-many-shapes":
      return message("draw.import.refusal.too-many-shapes", {
        max: MAX_IMPORT_SHAPES,
      });
    case "too-many-points":
      return message("draw.import.refusal.too-many-points", {
        max: MAX_IMPORT_POINTS,
      });
  }
}

/** What one skipped shape had wrong, after its count: "2 with edges that cross". */
function describeSkip(reason: ShapeImportSkip, count: number): Message {
  switch (reason) {
    case "self-intersecting":
      return message("draw.import.skip.self-intersecting", { count });
    case "degenerate":
      return message("draw.import.skip.degenerate", { count });
    case "too-few-vertices":
      return message("draw.import.skip.too-few-vertices", { count });
    case "radius-missing":
      return message("draw.import.skip.radius-missing", { count });
    case "radius-too-large":
      return message("draw.import.skip.radius-too-large", { count });
    case "out-of-range":
      return message("draw.import.skip.out-of-range", { count });
    case "too-many-points":
      return message("draw.import.skip.too-many-points", {
        count,
        max: MAX_IMPORT_SHAPE_POINTS,
      });
    case "malformed":
      return message("draw.import.skip.malformed", { count });
    case "unsupported":
      return message("draw.import.skip.unsupported", { count });
    case "other-srid":
      return message("draw.import.skip.other-srid", {
        count,
        srid: String(SUPPORTED_WKT_SRID),
      });
  }
}

const AXIS_SUGGESTIONS = {
  "lat-lng": message("draw.import.axisHint.lat-lng", {}),
  "lng-lat": message("draw.import.axisHint.lng-lat", {}),
} as const satisfies Readonly<Record<WktAxisOrder, Message>>;

/**
 * What to say when a WKT file imported nothing because its first position
 * fits only the other axis order. `suggested` is that other order.
 */
export function describeAxisSuggestion(suggested: WktAxisOrder): Message {
  return AXIS_SUGGESTIONS[suggested];
}

/** The order skipped shapes are listed in. */
const SKIP_REASONS: readonly ShapeImportSkip[] = [
  "self-intersecting",
  "degenerate",
  "too-few-vertices",
  "radius-missing",
  "radius-too-large",
  "out-of-range",
  "too-many-points",
  "malformed",
  "unsupported",
  "other-srid",
];

function describeSkips(
  skipped: Readonly<Partial<Record<ShapeImportSkip, number>>>,
): Message | null {
  const parts: Message[] = [];
  let total = 0;
  for (const reason of SKIP_REASONS) {
    const count = skipped[reason] ?? 0;
    if (count > 0) {
      parts.push(describeSkip(reason, count));
      total += count;
    }
  }
  const reasons = joinMessages(parts, "common.commaJoined");
  return reasons === null
    ? null
    : message("draw.import.skipped", { total, reasons });
}

/**
 * The message for what a file held, shown beside the Import button and
 * announced: how many shapes were imported, how many were skipped and why,
 * and whether holes were left out; or why the whole file was refused and
 * what to do instead.
 */
export function describeShapeImport(result: ShapeImport): Message {
  if (!result.ok) {
    const refusal = describeRefusal(result.refusal);
    return result.detail === undefined
      ? refusal
      : message("draw.import.refusalWithDetail", {
          refusal,
          detail: result.detail,
        });
  }
  const skips = describeSkips(result.skipped);
  if (result.shapes.length === 0 && skips === null) {
    return message("draw.import.noShapes", {});
  }
  const imported =
    result.shapes.length === 0
      ? message("draw.import.noneImported", {})
      : message("draw.import.imported", { count: result.shapes.length });
  const holes =
    result.holesDropped > 0
      ? message("draw.import.holesLeftOut", { count: result.holesDropped })
      : null;
  return appendMessages(imported, [skips, holes]);
}
