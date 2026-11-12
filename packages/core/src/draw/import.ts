// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { shortestLongitudeSpan } from "../globe/longitude";
import type { Bounds, LatLng } from "../ports/geometry";
import { SHAPES_CSV_HEADER } from "./export";
import type { DrawShapeInput } from "./reducer";
import { shapeRing, validateShape } from "./shape";
import type { DrawIssue } from "./types";

/**
 * The file types the import offers in the picker: GeoJSON and CSV, by
 * extension and by media type.
 */
export const SHAPE_FILE_TYPES: readonly string[] = [
  ".geojson",
  ".json",
  ".csv",
  "application/geo+json",
  "application/json",
  "text/csv",
];

/** The largest file the draw tool imports: 1 MB. Longer text is refused before it is read. */
export const MAX_IMPORT_BYTES = 1_000_000;

/**
 * How deeply JSON may nest. The deepest GeoJSON the import reads, a
 * MultiPolygon in a GeometryCollection in a FeatureCollection, needs ten
 * levels; 32 leaves room for nested properties and is still a safe depth for
 * any engine.
 */
export const MAX_IMPORT_DEPTH = 32;

/** The most shapes one file may hold, counting those that are skipped. */
export const MAX_IMPORT_SHAPES = 500;

/** The most points one imported shape may have. A longer shape is skipped. */
export const MAX_IMPORT_SHAPE_POINTS = 1_000;

/** The most points one file may hold in all. */
export const MAX_IMPORT_POINTS = 10_000;

/** The most shapes the drawing may hold. An import that would pass it is refused whole. */
export const MAX_DRAWING_SHAPES = 1_000;

/**
 * Why a whole file was refused. `drawing-full` is the caller's, when the
 * shapes would take the drawing past {@link MAX_DRAWING_SHAPES}.
 */
export type ShapeImportRefusal =
  | "drawing-full"
  | "empty"
  | "too-large"
  | "too-deep"
  | "not-recognised"
  | "too-many-shapes"
  | "too-many-points";

/** Why one shape in a file was skipped while the rest were imported. */
export type ShapeImportSkip =
  | DrawIssue
  | "out-of-range"
  | "too-many-points"
  | "malformed"
  | "unsupported";

/**
 * What a file held: a refusal of the whole file, or the shapes that can be
 * drawn with a count of those skipped for each reason and of the polygons
 * whose holes were left out.
 */
export type ShapeImport =
  | { readonly ok: false; readonly refusal: ShapeImportRefusal }
  | {
      readonly ok: true;
      readonly shapes: readonly DrawShapeInput[];
      readonly skipped: Readonly<Partial<Record<ShapeImportSkip, number>>>;
      readonly holesDropped: number;
    };

/** The header of the CSV the draw tool wrote before circles carried their radius. */
const LEGACY_CSV_HEADER = "id,type,area_m2,length_m,geometry";

/** A decimal number as `String(number)` writes it, and nothing looser such as `0x10` or an empty cell. */
const DECIMAL = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

const GEOMETRY_TYPES: ReadonlySet<unknown> = new Set([
  "Point",
  "LineString",
  "Polygon",
  "MultiPoint",
  "MultiLineString",
  "MultiPolygon",
  "GeometryCollection",
]);

/** What a file has given so far. Walking stops as soon as `refusal` is set. */
interface Collector {
  readonly shapes: DrawShapeInput[];
  readonly skipped: Partial<Record<ShapeImportSkip, number>>;
  holesDropped: number;
  /** Shapes met so far, imported or skipped. */
  count: number;
  /** Positions read so far. */
  points: number;
  refusal: ShapeImportRefusal | null;
}

type Candidate = DrawShapeInput | ShapeImportSkip;

type JsonObject = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A key of parsed JSON, read only when it is the object's own, so `__proto__` and inherited names are never followed. */
function field(object: JsonObject, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

function skip(collector: Collector, reason: ShapeImportSkip): void {
  collector.skipped[reason] = (collector.skipped[reason] ?? 0) + 1;
}

/** Adds one shape, or the reason it was skipped, and refuses the file once it holds too many. */
function add(collector: Collector, candidate: Candidate, holes = false): void {
  collector.count += 1;
  if (collector.count > MAX_IMPORT_SHAPES) {
    collector.refusal = "too-many-shapes";
    return;
  }
  if (typeof candidate === "string") {
    skip(collector, candidate);
    return;
  }
  const issue = validateShape({
    ...candidate,
    id: "candidate",
    label: "",
    done: true,
  });
  if (issue !== null) {
    skip(collector, issue);
    return;
  }
  collector.shapes.push(candidate);
  if (holes) {
    collector.holesDropped += 1;
  }
}

/** Counts positions read, and refuses the file once it holds too many. */
function spend(collector: Collector, points: number): boolean {
  collector.points += points;
  if (collector.points > MAX_IMPORT_POINTS) {
    collector.refusal = "too-many-points";
    return false;
  }
  return true;
}

/** A GeoJSON position, `[longitude, latitude]` with any altitude ignored. */
function readPosition(value: unknown): LatLng | ShapeImportSkip {
  if (!Array.isArray(value) || value.length < 2) {
    return "malformed";
  }
  const [lng, lat] = value as unknown[];
  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat)
  ) {
    return "malformed";
  }
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : "out-of-range";
}

/** The positions of a path, or why it cannot be read. `limit` is the most positions it may list. */
function readPath(
  collector: Collector,
  value: unknown,
  limit: number,
): LatLng[] | ShapeImportSkip {
  if (!Array.isArray(value)) {
    return "malformed";
  }
  if (value.length > limit) {
    return "too-many-points";
  }
  if (!spend(collector, value.length)) {
    return "too-many-points";
  }
  const vertices: LatLng[] = [];
  for (const item of value) {
    const position = readPosition(item);
    if (typeof position === "string") {
      return position;
    }
    vertices.push(position);
  }
  return vertices;
}

function pointShape(collector: Collector, coordinates: unknown): Candidate {
  if (!spend(collector, 1)) {
    return "too-many-points";
  }
  const position = readPosition(coordinates);
  return typeof position === "string"
    ? position
    : { kind: "point", vertices: [position] };
}

function lineShape(collector: Collector, coordinates: unknown): Candidate {
  const vertices = readPath(collector, coordinates, MAX_IMPORT_SHAPE_POINTS);
  return typeof vertices === "string" ? vertices : { kind: "line", vertices };
}

function samePosition(a: LatLng | undefined, b: LatLng | undefined): boolean {
  return (
    a !== undefined && b !== undefined && a.lat === b.lat && a.lng === b.lng
  );
}

/** Adds a polygon from its outer ring, dropping the ring's closing position and any holes. */
function addPolygon(collector: Collector, coordinates: unknown): void {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    add(collector, "malformed");
    return;
  }
  // A closed ring repeats its first position, so it may list one more.
  const ring = readPath(collector, coordinates[0], MAX_IMPORT_SHAPE_POINTS + 1);
  if (typeof ring === "string") {
    add(collector, ring);
    return;
  }
  if (ring.length > 1 && samePosition(ring[0], ring.at(-1))) {
    ring.pop();
  }
  if (ring.length > MAX_IMPORT_SHAPE_POINTS) {
    add(collector, "too-many-points");
    return;
  }
  add(collector, { kind: "polygon", vertices: ring }, coordinates.length > 1);
}

/** Adds each part of a Multi geometry as a shape of its own. */
function addParts(
  collector: Collector,
  coordinates: unknown,
  addPart: (part: unknown) => void,
): void {
  if (!Array.isArray(coordinates)) {
    add(collector, "malformed");
    return;
  }
  for (const part of coordinates) {
    if (collector.refusal) {
      return;
    }
    addPart(part);
  }
}

/** Adds the shapes of a geometry. A collection is flattened once; one inside another is skipped. */
function addGeometry(
  collector: Collector,
  geometry: unknown,
  nested: boolean,
): void {
  if (!isObject(geometry)) {
    add(collector, "unsupported");
    return;
  }
  const coordinates = field(geometry, "coordinates");
  switch (field(geometry, "type")) {
    case "Point":
      add(collector, pointShape(collector, coordinates));
      return;
    case "LineString":
      add(collector, lineShape(collector, coordinates));
      return;
    case "Polygon":
      addPolygon(collector, coordinates);
      return;
    case "MultiPoint":
      addParts(collector, coordinates, (part) =>
        add(collector, pointShape(collector, part)),
      );
      return;
    case "MultiLineString":
      addParts(collector, coordinates, (part) =>
        add(collector, lineShape(collector, part)),
      );
      return;
    case "MultiPolygon":
      addParts(collector, coordinates, (part) => addPolygon(collector, part));
      return;
    case "GeometryCollection": {
      const geometries = field(geometry, "geometries");
      if (nested || !Array.isArray(geometries)) {
        add(collector, "unsupported");
        return;
      }
      addParts(collector, geometries, (part) =>
        addGeometry(collector, part, true),
      );
      return;
    }
    default:
      add(collector, "unsupported");
  }
}

/** A circle from the properties the exporter writes, or null when they do not describe one. */
function circleFromProperties(
  collector: Collector,
  properties: unknown,
): DrawShapeInput | null {
  if (!isObject(properties) || field(properties, "type") !== "circle") {
    return null;
  }
  const radius = field(properties, "radius_m");
  const centre = readPosition(field(properties, "centre"));
  if (
    typeof radius !== "number" ||
    !Number.isFinite(radius) ||
    typeof centre === "string" ||
    !spend(collector, 1)
  ) {
    return null;
  }
  return { kind: "circle", vertices: [centre], radiusMetres: radius };
}

function addFeature(collector: Collector, feature: unknown): void {
  if (!isObject(feature) || field(feature, "type") !== "Feature") {
    add(collector, "unsupported");
    return;
  }
  const circle = circleFromProperties(collector, field(feature, "properties"));
  if (circle) {
    add(collector, circle);
    return;
  }
  addGeometry(collector, field(feature, "geometry"), false);
}

/**
 * Whether JSON text nests brackets deeper than `limit`, found by one pass
 * over the text without parsing it, so no engine is asked to recurse deeply.
 */
function nestsDeeperThan(text: string, limit: number): boolean {
  let depth = 0;
  let inString = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (inString) {
      if (char === "\\") {
        at += 1;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === "[" || char === "{") {
      depth += 1;
      if (depth > limit) {
        return true;
      }
    } else if (char === "]" || char === "}") {
      depth -= 1;
    }
  }
  return false;
}

/** Parses JSON text within the depth cap, or says why it could not. */
function readJson(text: string): { value: unknown } | "too-deep" | "malformed" {
  if (nestsDeeperThan(text, MAX_IMPORT_DEPTH)) {
    return "too-deep";
  }
  try {
    return { value: JSON.parse(text) };
  } catch {
    return "malformed";
  }
}

/** Adds what a GeoJSON object holds. False when it is not GeoJSON the draw tool can read. */
function addGeoJson(collector: Collector, value: JsonObject): boolean {
  const type = field(value, "type");
  if (type === "FeatureCollection") {
    const features = field(value, "features");
    if (!Array.isArray(features)) {
      return false;
    }
    addParts(collector, features, (feature) => addFeature(collector, feature));
    return true;
  }
  if (type === "Feature") {
    addFeature(collector, value);
    return true;
  }
  if (GEOMETRY_TYPES.has(type)) {
    addGeometry(collector, value, false);
    return true;
  }
  return false;
}

/** One CSV record: its fields, and false in `ok` when a quote was left open or followed by stray text. */
interface CsvRecord {
  readonly fields: readonly string[];
  readonly ok: boolean;
}

/** Where the unquoted text from `from` ends: the next comma, line break or the end. */
function fieldEnd(text: string, from: number): number {
  let at = from;
  while (at < text.length) {
    const char = text[at];
    if (char === "," || char === "\r" || char === "\n") {
      return at;
    }
    at += 1;
  }
  return at;
}

/** Reads a quoted field that starts after its opening quote, with `""` as a quote. */
function readQuoted(
  text: string,
  from: number,
): { value: string; next: number; closed: boolean } {
  let value = "";
  let at = from;
  while (at < text.length) {
    const quote = text.indexOf('"', at);
    if (quote < 0) {
      break;
    }
    value += text.slice(at, quote);
    if (text[quote + 1] !== '"') {
      return { value, next: quote + 1, closed: true };
    }
    value += '"';
    at = quote + 2;
  }
  return { value: value + text.slice(at), next: text.length, closed: false };
}

/** Reads one RFC 4180 record from `from`, and where the next one starts. */
function readRecord(
  text: string,
  from: number,
): { record: CsvRecord; next: number } {
  const fields: string[] = [];
  let ok = true;
  let at = from;
  for (;;) {
    if (text[at] === '"') {
      const quoted = readQuoted(text, at + 1);
      const end = fieldEnd(text, quoted.next);
      ok = ok && quoted.closed && end === quoted.next;
      fields.push(quoted.value);
      at = end;
    } else {
      const end = fieldEnd(text, at);
      fields.push(text.slice(at, end));
      at = end;
    }
    if (text[at] !== ",") {
      break;
    }
    at += 1;
  }
  const lineBreak = text[at] === "\r" && text[at + 1] === "\n" ? 2 : 1;
  return {
    record: { fields, ok },
    next: Math.min(text.length, at + lineBreak),
  };
}

/** A circle from the radius and centre cells, or null when they do not hold numbers. */
function circleFromCells(
  collector: Collector,
  radius: string,
  lng: string,
  lat: string,
): DrawShapeInput | null {
  if (!DECIMAL.test(radius) || !DECIMAL.test(lng) || !DECIMAL.test(lat)) {
    return null;
  }
  const centre = readPosition([Number(lng), Number(lat)]);
  if (typeof centre === "string" || !spend(collector, 1)) {
    return null;
  }
  return { kind: "circle", vertices: [centre], radiusMetres: Number(radius) };
}

function addCsvRecord(
  collector: Collector,
  record: CsvRecord,
  columns: number,
): void {
  if (!record.ok || record.fields.length !== columns) {
    add(collector, "malformed");
    return;
  }
  const [, type, , , geometry = "", radius = "", lng = "", lat = ""] =
    record.fields;
  const circle =
    type === "circle" ? circleFromCells(collector, radius, lng, lat) : null;
  if (circle) {
    add(collector, circle);
    return;
  }
  const json = readJson(geometry);
  if (typeof json === "string") {
    add(collector, "malformed");
    return;
  }
  addGeometry(collector, json.value, false);
}

/** How many columns a CSV of shapes has, from its header, or null when it is not one the draw tool wrote. */
function csvColumns(text: string): number | null {
  for (const header of [SHAPES_CSV_HEADER, LEGACY_CSV_HEADER]) {
    const after = text[header.length];
    if (
      text.startsWith(header) &&
      (after === undefined || after === "\r" || after === "\n")
    ) {
      return header.split(",").length;
    }
  }
  return null;
}

/** Adds the rows of a CSV of shapes, after its header. A blank line is ignored. */
function addCsv(collector: Collector, text: string, columns: number): void {
  let at = readRecord(text, 0).next;
  while (at < text.length && !collector.refusal) {
    const { record, next } = readRecord(text, at);
    at = next;
    if (record.fields.length === 1 && record.fields[0] === "") {
      continue;
    }
    addCsvRecord(collector, record, columns);
  }
}

function refuse(refusal: ShapeImportRefusal): ShapeImport {
  return { ok: false, refusal };
}

/**
 * Reads the shapes in a GeoJSON file or in a CSV the draw tool wrote, ready
 * for the draw reducer's `import` action. Pure and bounded, and never
 * throws: text from a file is hostile until proven otherwise.
 *
 * @remarks The format is told from the content. GeoJSON may be a
 *   `FeatureCollection`, a `Feature` or a bare geometry; Multi geometries
 *   give one shape per part, a `GeometryCollection` is flattened once, and a
 *   polygon keeps its outer ring, its holes left out and counted. A feature
 *   whose properties name a circle with `radius_m` and `centre`, as the
 *   exporter writes, is a circle again, and so is a CSV row with
 *   `radius_m`, `centre_lng` and `centre_lat`. Every shape must pass the
 *   draw tool's own rules with positions inside the world, or it is skipped
 *   and counted.
 *
 *   The text is refused whole when it is longer than
 *   {@link MAX_IMPORT_BYTES} characters, nests deeper than
 *   {@link MAX_IMPORT_DEPTH} (measured before parsing), or holds more than
 *   {@link MAX_IMPORT_SHAPES} shapes or {@link MAX_IMPORT_POINTS} points; a
 *   shape of more than {@link MAX_IMPORT_SHAPE_POINTS} points is skipped.
 *   Keys are read only when they are an object's own, so a `__proto__` key
 *   is inert. The work is linear in the text, apart from each polygon's
 *   check for crossing edges, which the per-shape cap bounds.
 */
export function parseShapeFile(text: string): ShapeImport {
  if (text.length > MAX_IMPORT_BYTES) {
    return refuse("too-large");
  }
  // `\s` covers the byte order mark (U+FEFF) as well as white space.
  const body = text.replace(/^\s+/, "");
  if (body === "") {
    return refuse("empty");
  }
  const collector: Collector = {
    shapes: [],
    skipped: {},
    holesDropped: 0,
    count: 0,
    points: 0,
    refusal: null,
  };
  const columns = csvColumns(body);
  if (columns !== null) {
    addCsv(collector, body, columns);
  } else if (body.startsWith("{")) {
    const json = readJson(body);
    if (json === "too-deep") {
      return refuse("too-deep");
    }
    // Text that starts with a brace and parses is an object.
    if (
      json === "malformed" ||
      !addGeoJson(collector, json.value as JsonObject)
    ) {
      return refuse("not-recognised");
    }
  } else {
    return refuse("not-recognised");
  }
  if (collector.refusal) {
    return refuse(collector.refusal);
  }
  return {
    ok: true,
    shapes: collector.shapes,
    skipped: collector.skipped,
    holesDropped: collector.holesDropped,
  };
}

/**
 * The box that holds every shape in `inputs`: each vertex, and the whole
 * of a circle's outline, taking the short way across the antimeridian (so
 * `east` may pass 180). Used to fit the map to what was imported.
 * @returns `undefined` when there is nothing to hold.
 */
export function shapeInputBounds(
  inputs: readonly DrawShapeInput[],
): Bounds | undefined {
  const points = inputs.flatMap((input) =>
    input.kind === "circle"
      ? shapeRing({ ...input, id: "bounds", label: "", done: true })
      : input.vertices,
  );
  const span = shortestLongitudeSpan(points.map((point) => point.lng));
  if (!span) {
    return undefined;
  }
  const lats = points.map((point) => point.lat);
  return {
    south: Math.min(...lats),
    west: span.west,
    north: Math.max(...lats),
    east: span.east,
  };
}
