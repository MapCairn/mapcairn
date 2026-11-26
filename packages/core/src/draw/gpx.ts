// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import {
  type StartTag,
  walkXml,
  type XmlHandler,
  type XmlReading,
} from "./xml";

/** A GPX decimal (`xsd:decimal`): an optional sign, digits and an optional fraction, with no exponent, hex or empty text. */
const GPX_DECIMAL = /^[+-]?\d+(?:\.\d+)?$/;

/**
 * How deeply GPX elements may nest. The deepest place a position can sit is
 * `gpx/trk/trkseg/trkpt`, four levels; 32 leaves room for the extensions a
 * device adds and matches the JSON cap.
 */
const MAX_GPX_DEPTH = 32;

/** A GeoJSON geometry a GPX element gives, longitude first. A position that is not a number is NaN. */
export type GpxGeometry =
  | { readonly type: "Point"; readonly coordinates: readonly number[] }
  | {
      readonly type: "LineString";
      readonly coordinates: readonly (readonly number[])[];
    };

/**
 * How reading GPX text ended: `ok` (all of it was read), `stopped` (the caller
 * asked to stop), `not-gpx` (the text is not a GPX document), `unreadable`
 * (it starts as GPX but is damaged) or `too-deep`.
 */
export type GpxReading =
  | "ok"
  | "stopped"
  | "not-gpx"
  | "unreadable"
  | "too-deep";

const ROOT = "gpx";
const WAYPOINT = "gpx/wpt";

/** The path of each element that makes a line, and the path of the points that make it up. */
const LINE_POINTS: ReadonlyMap<string, string> = new Map([
  ["gpx/rte", "gpx/rte/rtept"],
  ["gpx/trk/trkseg", "gpx/trk/trkseg/trkpt"],
]);
const POINT_PATHS: ReadonlySet<string> = new Set(LINE_POINTS.values());

/** One position, longitude first, with NaN for a number that is not plain decimal text. */
function position({ lat, lon }: StartTag): number[] {
  return [
    GPX_DECIMAL.test(lon) ? Number(lon) : Number.NaN,
    GPX_DECIMAL.test(lat) ? Number(lat) : Number.NaN,
  ];
}

/** Gives the geometries of the elements {@link walkXml} meets, matched by their full path. */
class GpxHandler implements XmlHandler {
  readonly maxDepth = MAX_GPX_DEPTH;
  private line: number[][] | null = null;

  constructor(
    private readonly onGeometry: (geometry: GpxGeometry) => boolean,
  ) {}

  isRoot(name: string): boolean {
    return name === ROOT;
  }

  open(path: readonly string[], start: StartTag): boolean {
    const here = path.join("/");
    if (here === WAYPOINT) {
      return this.onGeometry({ type: "Point", coordinates: position(start) });
    }
    if (LINE_POINTS.has(here)) {
      this.line = [];
    } else if (POINT_PATHS.has(here)) {
      this.line?.push(position(start));
    }
    return true;
  }

  close(path: readonly string[]): boolean {
    if (!LINE_POINTS.has(path.join("/")) || this.line === null) {
      return true;
    }
    const finished = this.line;
    this.line = null;
    return this.onGeometry({ type: "LineString", coordinates: finished });
  }

  wantsText(): boolean {
    return false;
  }

  text(): void {}
}

const READINGS: Readonly<Record<XmlReading, GpxReading>> = {
  ok: "ok",
  stopped: "stopped",
  foreign: "not-gpx",
  unreadable: "unreadable",
  "too-deep": "too-deep",
};

/**
 * Walks GPX text and gives each waypoint as a Point, and each route and track
 * segment as a LineString, to `onGeometry` in file order. Return false from it
 * to stop.
 *
 * @remarks A hand-written scan, not an XML parser: it needs no library or
 *   `DOMParser`, and each character is read a fixed number of times, so the
 *   work is linear in the text. Entities are never expanded and nothing
 *   external is fetched: attribute values are read as they stand and only a
 *   plain decimal `lat` and `lon` give a number, so `&#49;` or a name defined
 *   in a `DOCTYPE` is not one, nor is an exponent or hex form (the GPX
 *   schema's `xsd:decimal` allows neither). A `DOCTYPE` makes the text not GPX. Names,
 *   descriptions, extensions and any text between elements are never read,
 *   so there is no markup to show. Elements are matched by their full path
 *   (`gpx/wpt`, `gpx/rte/rtept`, `gpx/trk/trkseg/trkpt`), so a lookalike
 *   inside an extension is ignored. Names are matched as written, so an
 *   element with a namespace prefix (`<gpx:wpt>`, `<ns:gpx>`) is not read: a
 *   prefixed root makes the text `not-gpx`, and a prefixed child is ignored. The text must be well formed as far as
 *   elements go: a tag left open, closed twice or out of order is `unreadable`.
 */
export function readGpx(
  text: string,
  onGeometry: (geometry: GpxGeometry) => boolean,
): GpxReading {
  return READINGS[walkXml(text, new GpxHandler(onGeometry))];
}
