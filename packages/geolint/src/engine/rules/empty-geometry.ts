// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors

import { MAX_COLLECTION_DEPTH } from "../geometry/walk.js";
import { isObject, pointer } from "../json.js";
import type { Finding, Rule } from "../types.js";
import { capFindings } from "./findingCap.js";

const MULTI_TYPES: ReadonlySet<string> = new Set([
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);

/**
 * How many arrays deep valid coordinates go: a MultiPolygon holds polygons,
 * which hold rings, which hold positions. Anything deeper is malformed, which
 * the `structure` rule reports, and is not called empty here.
 */
const MAX_COORDINATE_DEPTH = 4;

/** Whether a `coordinates` value holds no position at any depth, looking no deeper than valid coordinates go. */
function holdsNoPosition(coordinates: unknown, depth = 1): boolean {
  if (!Array.isArray(coordinates) || depth > MAX_COORDINATE_DEPTH) {
    return false;
  }
  if (coordinates.length === 0) {
    return true;
  }
  if (typeof coordinates[0] === "number") {
    return false;
  }
  return coordinates.every((member) => holdsNoPosition(member, depth + 1));
}

function emptyFinding(path: string, what: string): Finding {
  return {
    ruleId: "empty-geometry",
    severity: "warning",
    confidence: "high",
    path,
    message: `${what} holds no coordinates, so it draws nothing.`,
    fixable: false,
  };
}

function checkGeometry(
  geometry: unknown,
  path: string,
  depth: number,
): Finding[] {
  if (!isObject(geometry) || typeof geometry.type !== "string") {
    return [];
  }
  if (geometry.type === "GeometryCollection") {
    const members = geometry.geometries;
    if (!Array.isArray(members)) {
      return [];
    }
    if (members.length === 0) {
      return [emptyFinding(path, "This GeometryCollection")];
    }
    if (depth >= MAX_COLLECTION_DEPTH) {
      return [];
    }
    return members.flatMap((member: unknown, index: number) =>
      checkGeometry(member, pointer(path, "geometries", index), depth + 1),
    );
  }
  const isPoint = geometry.type === "Point";
  if (
    (isPoint || MULTI_TYPES.has(geometry.type)) &&
    holdsNoPosition(geometry.coordinates)
  ) {
    return [emptyFinding(path, `This ${geometry.type}`)];
  }
  return [];
}

function check(feature: unknown): Finding[] {
  if (!isObject(feature) || feature.type !== "Feature") {
    return [];
  }
  if (feature.geometry === null) {
    return [
      {
        ruleId: "empty-geometry",
        severity: "info",
        confidence: "medium",
        path: "/geometry",
        message:
          "This feature has a null geometry. That is valid for a feature with no location, but it will not appear on a map.",
        fixable: false,
      },
    ];
  }
  return capFindings(
    checkGeometry(feature.geometry, "/geometry", 0),
    emptyGeometryRule,
    feature,
  );
}

/** Reports a null geometry (information) and geometries that hold no coordinates (a warning). */
export const emptyGeometryRule: Rule = {
  id: "empty-geometry",
  severity: "warning",
  confidence: "high",
  summary: "A geometry with no coordinates, or a feature with a null geometry",
  fixable: false,
  needsRegion: false,
  check,
};
