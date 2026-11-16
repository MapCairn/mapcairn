// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { isObject } from "../json.js";
import type { DocumentInfo, Finding, Rule } from "../types.js";

/** The names a legacy `crs` member uses for WGS 84, the only system RFC 7946 allows. */
const WGS84_NAME = /(^|:)(EPSG:{1,2}4326|CRS84|OGC:1\.3:CRS84)$/i;

/** The system a legacy `crs` member names, as text, or undefined when it names none. */
function crsName(crs: unknown): string | undefined {
  if (!isObject(crs) || !isObject(crs.properties)) {
    return undefined;
  }
  const { name, href } = crs.properties;
  if (typeof name === "string") {
    return name;
  }
  return typeof href === "string" ? href : undefined;
}

function isWgs84(name: string | undefined): boolean {
  return name !== undefined && WGS84_NAME.test(name.trim());
}

/** A finding for a `crs` member found at `path` (the pointer of the member itself). */
function crsFinding(crs: unknown, path: string): Finding {
  const name = crsName(crs);
  const harmless = crs === null || isWgs84(name);
  const named = name === undefined ? "" : ` (${name})`;
  const message = harmless
    ? `The crs member${named} was removed from GeoJSON by RFC 7946, which fixes the system as WGS 84. Remove it.`
    : `The crs member${named} was removed from GeoJSON by RFC 7946, which fixes the system as WGS 84. If the coordinates are not in WGS 84 they will be read wrongly: reproject them and remove the member.`;
  return {
    ruleId: "deprecated-crs-member",
    severity: harmless ? "info" : "warning",
    confidence: "high",
    path,
    message,
    fixable: false,
    data: name === undefined ? undefined : { crs: name },
  };
}

function checkFeature(feature: unknown): Finding[] {
  if (!isObject(feature)) {
    return [];
  }
  const findings: Finding[] = [];
  if ("crs" in feature) {
    findings.push(crsFinding(feature.crs, "/crs"));
  }
  const geometry = feature.geometry;
  if (isObject(geometry) && "crs" in geometry) {
    findings.push(crsFinding(geometry.crs, "/geometry/crs"));
  }
  return findings;
}

/**
 * Reports a root `crs` unless the root went through `checkFeature` as a
 * feature, which has reported it already.
 */
function checkDocument(document: DocumentInfo): Finding[] {
  if (document.rootIsFeature || !("crs" in document.members)) {
    return [];
  }
  return [crsFinding(document.members.crs, "/crs")];
}

/** Reports a `crs` member, which RFC 7946 removed: warns when it names a system other than WGS 84. */
export const deprecatedCrsMemberRule: Rule = {
  id: "deprecated-crs-member",
  severity: "warning",
  confidence: "high",
  summary:
    "A crs member, removed by RFC 7946 (a warning when it names a system other than WGS 84)",
  fixable: false,
  needsRegion: false,
  check: checkFeature,
  checkDocument,
};
