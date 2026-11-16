// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { MAX_COLLECTION_DEPTH } from "../geometry/walk.js";
import { isFiniteNumber, isObject, pointer } from "../json.js";
import type { DocumentInfo, Finding, Rule, Severity } from "../types.js";

/** How many problems are reported for one feature before the rest are counted. */
export const MAX_PROBLEMS_PER_FEATURE = 20;

const ROOT_TYPES: ReadonlySet<string> = new Set([
  "FeatureCollection",
  "Feature",
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

/** The fewest positions a line, and a polygon ring, may have (RFC 7946, sections 3.1.4 and 3.1.6). */
const MIN_LINE_POSITIONS = 2;
const MIN_RING_POSITIONS = 4;
/** Longitude, latitude, and an optional altitude. */
const MAX_POSITION_ELEMENTS = 3;
const MIN_POSITION_ELEMENTS = 2;
/** A bounding box has 2n numbers for n dimensions: two or three. */
const BBOX_LENGTHS: readonly number[] = [4, 6];

/** Collects findings up to a cap, then only counts what it drops. */
class Problems {
  private readonly found: Finding[] = [];
  private dropped = 0;

  add(path: string, message: string, severity: Severity = "error"): void {
    if (this.found.length >= MAX_PROBLEMS_PER_FEATURE) {
      this.dropped += 1;
      return;
    }
    this.found.push({
      ruleId: "structure",
      severity,
      confidence: "high",
      path,
      message,
      fixable: false,
    });
  }

  /** The findings, with one last finding that counts the ones left out. */
  result(): Finding[] {
    if (this.dropped === 0) {
      return this.found;
    }
    return [
      ...this.found,
      {
        ruleId: "structure",
        severity: "error",
        confidence: "high",
        path: "",
        message: `${this.dropped} more structure problems in this feature are not shown.`,
        fixable: false,
        data: { suppressed: this.dropped },
      },
    ];
  }
}

function describe(value: unknown): string {
  if (value === null) {
    return "null";
  }
  return Array.isArray(value) ? "an array" : typeof value;
}

/** What is wrong with one position, found without building its pointer. */
interface PositionProblem {
  readonly message: string;
  /** The index of the element to point at, when it is an element and not the position. */
  readonly element: number | undefined;
  readonly severity: Severity;
}

/** The index of the first element that is not a finite number, or -1. A loop, because this runs for every position. */
function firstNonNumber(values: readonly unknown[]): number {
  for (let index = 0; index < values.length; index++) {
    if (!isFiniteNumber(values[index])) {
      return index;
    }
  }
  return -1;
}

/**
 * What is wrong with a position element that is not a finite number. JSON has
 * no infinity, so an infinite one is a number written too large for a double
 * (`1e999`), which a parser reads as infinity.
 */
function describeBadElement(value: unknown): string {
  if (typeof value !== "number") {
    return `Position elements must be finite numbers, not ${describe(value)}.`;
  }
  if (Number.isNaN(value)) {
    return "Position elements must be finite numbers, but this one is NaN.";
  }
  return "Position elements must be finite numbers, but this one is too large to be a number.";
}

function positionProblem(value: unknown): PositionProblem | undefined {
  if (!Array.isArray(value)) {
    return {
      message: `A position must be an array of numbers, not ${describe(value)}.`,
      element: undefined,
      severity: "error",
    };
  }
  if (value.length < MIN_POSITION_ELEMENTS) {
    return {
      message:
        "A position needs at least two numbers: longitude, then latitude.",
      element: undefined,
      severity: "error",
    };
  }
  const bad = firstNonNumber(value);
  if (bad !== -1) {
    return {
      message: describeBadElement(value[bad]),
      element: bad,
      severity: "error",
    };
  }
  if (value.length > MAX_POSITION_ELEMENTS) {
    return {
      message:
        "A position should have two or three numbers (longitude, latitude and an optional altitude).",
      element: undefined,
      severity: "warning",
    };
  }
  return undefined;
}

function reportPosition(
  problem: PositionProblem,
  path: string,
  problems: Problems,
): void {
  problems.add(
    problem.element === undefined ? path : pointer(path, problem.element),
    problem.message,
    problem.severity,
  );
}

function checkRun(
  value: unknown,
  path: string,
  least: number,
  what: string,
  problems: Problems,
): void {
  if (!Array.isArray(value)) {
    problems.add(
      path,
      `${what} must be an array of positions, not ${describe(value)}.`,
    );
    return;
  }
  if (value.length < least) {
    problems.add(
      path,
      `${what} needs at least ${least} positions, but has ${value.length}.`,
    );
  }
  for (let index = 0; index < value.length; index++) {
    const problem = positionProblem(value[index]);
    if (problem !== undefined) {
      reportPosition(problem, pointer(path, index), problems);
    }
  }
}

function checkArrayOf(
  value: unknown,
  path: string,
  what: string,
  problems: Problems,
  checkMember: (member: unknown, memberPath: string) => void,
): void {
  if (!Array.isArray(value)) {
    problems.add(path, `${what} must be an array, not ${describe(value)}.`);
    return;
  }
  value.forEach((member: unknown, index: number) => {
    checkMember(member, pointer(path, index));
  });
}

function checkPolygon(value: unknown, path: string, problems: Problems): void {
  checkArrayOf(
    value,
    path,
    "A polygon's coordinates",
    problems,
    (ring, ringPath) => {
      checkRun(ring, ringPath, MIN_RING_POSITIONS, "A polygon ring", problems);
    },
  );
}

function checkCoordinates(
  type: string,
  coordinates: unknown,
  path: string,
  problems: Problems,
): void {
  switch (type) {
    case "Point": {
      const problem = positionProblem(coordinates);
      if (problem !== undefined) {
        reportPosition(problem, path, problems);
      }
      return;
    }
    case "MultiPoint":
      checkRun(coordinates, path, 0, "A MultiPoint", problems);
      return;
    case "LineString":
      checkRun(coordinates, path, MIN_LINE_POSITIONS, "A LineString", problems);
      return;
    case "MultiLineString":
      checkArrayOf(
        coordinates,
        path,
        "A MultiLineString",
        problems,
        (line, linePath) => {
          checkRun(line, linePath, MIN_LINE_POSITIONS, "A line", problems);
        },
      );
      return;
    case "Polygon":
      checkPolygon(coordinates, path, problems);
      return;
    default:
      checkArrayOf(
        coordinates,
        path,
        "A MultiPolygon",
        problems,
        (polygon, polygonPath) => {
          checkPolygon(polygon, polygonPath, problems);
        },
      );
  }
}

function checkBbox(value: unknown, path: string, problems: Problems): void {
  const valid =
    Array.isArray(value) &&
    BBOX_LENGTHS.includes(value.length) &&
    value.every(isFiniteNumber);
  if (!valid) {
    problems.add(path, "A bbox must be an array of four or six numbers.");
  }
}

function checkGeometry(
  geometry: unknown,
  path: string,
  depth: number,
  problems: Problems,
): void {
  if (!isObject(geometry)) {
    problems.add(
      path,
      `A geometry must be an object, not ${describe(geometry)}.`,
    );
    return;
  }
  const { type } = geometry;
  if ("bbox" in geometry) {
    checkBbox(geometry.bbox, pointer(path, "bbox"), problems);
  }
  if (type === "GeometryCollection") {
    if (depth >= MAX_COLLECTION_DEPTH) {
      problems.add(path, "GeometryCollections are nested too deeply to check.");
      return;
    }
    checkArrayOf(
      geometry.geometries,
      pointer(path, "geometries"),
      "A GeometryCollection's geometries",
      problems,
      (member, memberPath) => {
        checkGeometry(member, memberPath, depth + 1, problems);
      },
    );
    return;
  }
  if (typeof type !== "string") {
    problems.add(
      pointer(path, "type"),
      "A geometry needs a type member that is a string.",
    );
    return;
  }
  if (
    !ROOT_TYPES.has(type) ||
    type === "Feature" ||
    type === "FeatureCollection"
  ) {
    problems.add(
      pointer(path, "type"),
      `${JSON.stringify(type)} is not a geometry type. Use Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon or GeometryCollection.`,
    );
    return;
  }
  checkCoordinates(
    type,
    geometry.coordinates,
    pointer(path, "coordinates"),
    problems,
  );
}

function checkMembers(
  feature: Record<string, unknown>,
  problems: Problems,
): void {
  if (!("properties" in feature)) {
    problems.add(
      "",
      "A Feature needs a properties member (an object, or null).",
    );
  } else if (feature.properties !== null && !isObject(feature.properties)) {
    problems.add(
      "/properties",
      `properties must be an object or null, not ${describe(feature.properties)}.`,
    );
  }
  if (
    "id" in feature &&
    typeof feature.id !== "string" &&
    !isFiniteNumber(feature.id)
  ) {
    problems.add("/id", "A Feature id must be a string or a number.");
  }
  if ("bbox" in feature) {
    checkBbox(feature.bbox, "/bbox", problems);
  }
}

function checkFeatureShape(feature: unknown, problems: Problems): void {
  if (!isObject(feature)) {
    problems.add("", `A feature must be an object, not ${describe(feature)}.`);
    return;
  }
  if (feature.type !== "Feature") {
    const found =
      typeof feature.type === "string" ? feature.type : describe(feature.type);
    problems.add(
      "/type",
      `A feature's type must be "Feature", not ${JSON.stringify(found)}. A bare geometry has to be wrapped in a Feature.`,
    );
    return;
  }
  if (!("geometry" in feature)) {
    problems.add(
      "",
      "A Feature needs a geometry member (an object, or null for no location).",
    );
  } else if (feature.geometry !== null) {
    checkGeometry(feature.geometry, "/geometry", 0, problems);
  }
  checkMembers(feature, problems);
}

function check(feature: unknown): Finding[] {
  const problems = new Problems();
  checkFeatureShape(feature, problems);
  return problems.result();
}

function documentFinding(path: string, message: string): Finding {
  return {
    ruleId: "structure",
    severity: "error",
    confidence: "high",
    path,
    message,
    fixable: false,
  };
}

/** The first thing wrong with the root's own shape, as a list of at most one finding. */
function rootFindings(document: DocumentInfo): Finding[] {
  const finding = documentFinding;
  if (document.rootType === undefined) {
    return [
      finding(
        "",
        "The document is not GeoJSON: its root must be an object with a type member.",
      ),
    ];
  }
  if (!ROOT_TYPES.has(document.rootType)) {
    return [
      finding(
        "/type",
        `${JSON.stringify(document.rootType)} is not a GeoJSON type. Use FeatureCollection, Feature or a geometry type.`,
      ),
    ];
  }
  if (document.rootType === "FeatureCollection" && !document.hasFeatures) {
    return [
      finding(
        "/features",
        "A FeatureCollection needs a features member that is an array.",
      ),
    ];
  }
  return [];
}

function checkDocument(document: DocumentInfo): Finding[] {
  const findings = rootFindings(document);
  if (document.duplicateMembers.includes("features")) {
    findings.push(
      documentFinding(
        "/features",
        "The features member is repeated. Only the first one is checked, so the features in a later one are not.",
      ),
    );
  }
  return findings;
}

/** Checks the shape RFC 7946 gives features, geometries, positions and bounding boxes. */
export const structureRule: Rule = {
  id: "structure",
  severity: "error",
  confidence: "high",
  summary: "The type, geometry and coordinates are not shaped as RFC 7946 says",
  fixable: false,
  needsRegion: false,
  check,
  checkDocument,
};
