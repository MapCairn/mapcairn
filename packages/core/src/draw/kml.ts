// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import { walkXml, type XmlHandler, type XmlReading } from "./xml";

/** A KML number (`xsd:double`): an optional sign, digits with an optional fraction or a fraction alone (`.5`, `5.`), and an optional exponent; never hex, `NaN` or empty text. */
const KML_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * How deeply KML elements may nest. A position in a polygon of a folder tree
 * sits about ten levels down; 32 leaves room for folders and extensions and
 * matches the JSON cap.
 */
export const MAX_KML_DEPTH = 32;

/** How many numbers a tuple of a `coordinates` element may have: longitude and latitude, then an optional altitude. */
const TUPLE_SIZES: ReadonlySet<number> = new Set([2, 3]);

/** A position that is not a number, which the importer counts as malformed. */
const NO_POSITION: KmlPosition = [Number.NaN, Number.NaN];

/** Runs of white space, which separate the tuples of a `coordinates` element. */
const WHITE_SPACE = /\s+/;

type KmlPosition = readonly number[];

/**
 * A GeoJSON geometry a KML element gives, longitude first. A position that is
 * not a number is NaN. A polygon lists its outer ring first, then one empty
 * ring for each inner boundary (the holes are counted, not read), and no ring
 * at all when it has no outer boundary. `Unsupported` stands for a `gx:Track`
 * or `gx:MultiTrack`, which is not read.
 */
export type KmlGeometry =
  | { readonly type: "Point"; readonly coordinates: KmlPosition }
  | {
      readonly type: "LineString";
      readonly coordinates: readonly KmlPosition[];
    }
  | {
      readonly type: "Polygon";
      readonly coordinates: readonly (readonly KmlPosition[])[];
    }
  | { readonly type: "Unsupported" };

/**
 * How reading KML text ended: `ok` (all of it was read), `stopped` (the caller
 * asked to stop), `not-kml` (the text is not a KML document), `unreadable`
 * (it starts as KML but is damaged) or `too-deep`.
 */
export type KmlReading =
  | "ok"
  | "stopped"
  | "not-kml"
  | "unreadable"
  | "too-deep";

/** What an open element is to the reader, by where it sits. `other` is anything it does not read. */
type Kind =
  | "kml"
  | "folder"
  | "placemark"
  | "multi"
  | "point"
  | "line"
  | "polygon"
  | "outer"
  | "inner"
  | "ring"
  | "track"
  | "coordinates"
  | "other";

const NOTHING: ReadonlyMap<string, Kind> = new Map();
const CONTAINERS: ReadonlyMap<string, Kind> = new Map([
  ["Document", "folder"],
  ["Folder", "folder"],
  ["Placemark", "placemark"],
]);
const GEOMETRIES: ReadonlyMap<string, Kind> = new Map([
  ["MultiGeometry", "multi"],
  ["Point", "point"],
  ["LineString", "line"],
  ["LinearRing", "line"],
  ["Polygon", "polygon"],
  ["Track", "track"],
  ["MultiTrack", "track"],
]);
const BOUNDARIES: ReadonlyMap<string, Kind> = new Map([
  ["outerBoundaryIs", "outer"],
  ["innerBoundaryIs", "inner"],
]);
const RINGS: ReadonlyMap<string, Kind> = new Map([["LinearRing", "ring"]]);
const COORDINATES: ReadonlyMap<string, Kind> = new Map([
  ["coordinates", "coordinates"],
]);

/** The element names that matter inside each kind of element, and what they are. */
const CHILDREN: Readonly<Record<Kind, ReadonlyMap<string, Kind>>> = {
  kml: CONTAINERS,
  folder: CONTAINERS,
  placemark: GEOMETRIES,
  multi: GEOMETRIES,
  polygon: BOUNDARIES,
  outer: RINGS,
  inner: RINGS,
  point: COORDINATES,
  line: COORDINATES,
  ring: COORDINATES,
  track: NOTHING,
  coordinates: NOTHING,
  other: NOTHING,
};

/** An element name without its namespace prefix, so `kml:Placemark` reads as `Placemark`. */
function localName(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1);
}

/** One `lon,lat[,alt]` tuple, with NaN for anything that is not plain decimal text. */
function readTuple(token: string): KmlPosition {
  const parts = token.split(",");
  const plain =
    TUPLE_SIZES.has(parts.length) &&
    parts.every((part) => KML_DECIMAL.test(part));
  return plain
    ? [Number(parts[0]), Number(parts[1])]
    : [Number.NaN, Number.NaN];
}

/** The tuples of a `coordinates` element's text. A space inside a tuple (`1, 2`) splits it, so it reads as not numbers. */
function readCoordinates(text: string): KmlPosition[] {
  const trimmed = text.trim();
  return trimmed === "" ? [] : trimmed.split(WHITE_SPACE).map(readTuple);
}

/** Gives the geometries of the Placemarks {@link walkXml} meets, tracking what each open element is. */
class KmlHandler implements XmlHandler {
  readonly maxDepth = MAX_KML_DEPTH;
  private readonly kinds: Kind[] = [];
  private pieces: string[] = [];
  private outer: readonly KmlPosition[] | null = null;
  private holes = 0;
  /** Whether the open Point or line has had its `coordinates` element. */
  private placed = false;

  constructor(
    private readonly onGeometry: (geometry: KmlGeometry) => boolean,
  ) {}

  isRoot(name: string): boolean {
    return localName(name) === "kml";
  }

  open(path: readonly string[]): boolean {
    const parent = this.kinds.at(-1);
    const name = localName(path.at(-1) as string);
    const kind: Kind =
      parent === undefined ? "kml" : (CHILDREN[parent].get(name) ?? "other");
    this.kinds.push(kind);
    if (kind === "polygon") {
      this.outer = null;
      this.holes = 0;
    } else if (kind === "point" || kind === "line") {
      this.placed = false;
    } else if (kind === "coordinates") {
      this.pieces = [];
    }
    return kind === "track" ? this.onGeometry({ type: "Unsupported" }) : true;
  }

  close(): boolean {
    const kind = this.kinds.pop();
    if (kind === "coordinates") {
      return this.closeCoordinates(readCoordinates(this.pieces.join("")));
    }
    if (kind === "point" || kind === "line") {
      return this.placed || this.onGeometry(this.unplaced(kind));
    }
    if (kind === "polygon") {
      return this.onGeometry({
        type: "Polygon",
        coordinates:
          this.outer === null
            ? []
            : [this.outer, ...Array.from({ length: this.holes }, () => [])],
      });
    }
    return true;
  }

  /** The geometry for a Point or line that never had `coordinates`: one position that is not a number, so it is counted as malformed. */
  private unplaced(kind: "point" | "line"): KmlGeometry {
    return kind === "point"
      ? { type: "Point", coordinates: NO_POSITION }
      : { type: "LineString", coordinates: [NO_POSITION] };
  }

  /** Takes in the tuples of a `coordinates` element by what holds it. */
  private closeCoordinates(tuples: KmlPosition[]): boolean {
    const holder = this.kinds.at(-1);
    const boundary = this.kinds.at(-2);
    if ((holder === "point" || holder === "line") && this.placed) {
      return true;
    }
    if (holder === "point") {
      this.placed = true;
      return this.onGeometry({
        type: "Point",
        coordinates: tuples.length === 1 ? (tuples[0] as KmlPosition) : [],
      });
    }
    if (holder === "line") {
      this.placed = true;
      return this.onGeometry({ type: "LineString", coordinates: tuples });
    }
    if (boundary === "outer") {
      this.outer ??= tuples;
    } else if (boundary === "inner") {
      this.holes += 1;
    }
    return true;
  }

  wantsText(): boolean {
    return this.kinds.at(-1) === "coordinates";
  }

  characters(piece: string): void {
    this.pieces.push(piece);
  }
}

const READINGS: Readonly<Record<XmlReading, KmlReading>> = {
  ok: "ok",
  stopped: "stopped",
  foreign: "not-kml",
  unreadable: "unreadable",
  "too-deep": "too-deep",
};

/**
 * Walks KML text and gives each Placemark's Point as a Point, each LineString
 * (and a LinearRing standing alone) as a LineString, and each Polygon as a
 * Polygon, to `onGeometry` in file order. Return false from it to stop.
 *
 * @remarks Built on {@link walkXml}, so it needs no library or `DOMParser`,
 *   the work is linear in the text, entities are never expanded and nothing
 *   external is fetched (core cannot fetch at all: a `NetworkLink`, an `Icon`
 *   or any `href` is never read). A `DOCTYPE` makes the text not KML. Element
 *   names are matched without a namespace prefix and by where they sit: a
 *   Placemark directly under `kml` or under any depth of `Document` and
 *   `Folder`, with its geometry directly in it or in `MultiGeometry`, which
 *   nests and is flattened (each part is its own geometry). A lookalike
 *   inside `ExtendedData`, a `NetworkLink` or an `Update` is ignored, and so
 *   are overlays, models, styles, names, descriptions and any text between
 *   elements, so there is no markup to show. A `gx:Track` or `gx:MultiTrack`
 *   (whose positions are `gx:coord` elements) is not read: each one gives one
 *   `Unsupported` geometry so it can be counted. A polygon gives its outer
 *   boundary's ring; each inner boundary adds an empty ring, since holes are
 *   not read. Coordinates are `lon,lat[,alt]` tuples separated by white
 *   space, read as plain decimals from the text and CDATA of the element, so
 *   an entity (`&#44;`) or a space after a comma makes a position that is not
 *   a number. A Point that does not have exactly one tuple gives no usable
 *   position, and a Point or line with no `coordinates` element gives one
 *   position that is not a number. Only the first `coordinates` of a Point or
 *   line, and the first outer boundary of a polygon, are read. The text must be well formed as far as elements go: a tag left
 *   open, closed twice or out of order is `unreadable`.
 */
export function readKml(
  text: string,
  onGeometry: (geometry: KmlGeometry) => boolean,
): KmlReading {
  return READINGS[walkXml(text, new KmlHandler(onGeometry))];
}
