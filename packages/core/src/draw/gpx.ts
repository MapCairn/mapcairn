// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

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

/** An element or attribute name: everything up to white space or the next piece of markup. */
const NAME = /[^\s/>=<"'!?]+/y;
const SPACE = /\s*/y;

/** Where `pattern`, a sticky expression, matches from `at`: its end, and what it matched. */
function matchAt(
  pattern: RegExp,
  text: string,
  at: number,
): { end: number; value: string } {
  pattern.lastIndex = at;
  const found = pattern.exec(text);
  return found
    ? { end: pattern.lastIndex, value: found[0] }
    : { end: at, value: "" };
}

/** A parsed start tag: where it ends, whether it closes itself, and the two attributes a position needs. */
interface StartTag {
  readonly end: number;
  readonly selfClosing: boolean;
  readonly lat: string;
  readonly lon: string;
}

/** Reads the attributes of a start tag from `from`, or null when they are damaged. Values are never decoded. */
function readAttributes(text: string, from: number): StartTag | null {
  let at = from;
  let lat = "";
  let lon = "";
  for (;;) {
    at = matchAt(SPACE, text, at).end;
    if (text.startsWith(">", at)) {
      return { end: at + 1, selfClosing: false, lat, lon };
    }
    if (text.startsWith("/>", at)) {
      return { end: at + 2, selfClosing: true, lat, lon };
    }
    const name = matchAt(NAME, text, at);
    at = matchAt(SPACE, text, name.end).end;
    if (name.value === "" || !text.startsWith("=", at)) {
      return null;
    }
    at = matchAt(SPACE, text, at + 1).end;
    const quote = text[at];
    const close =
      quote === '"' || quote === "'" ? text.indexOf(quote, at + 1) : -1;
    if (close < 0) {
      return null;
    }
    const value = text.slice(at + 1, close);
    if (name.value === "lat" && lat === "") {
      lat = value;
    } else if (name.value === "lon" && lon === "") {
      lon = value;
    }
    at = close + 1;
  }
}

/** One position, longitude first, with NaN for a number that is not plain decimal text. */
function position({ lat, lon }: StartTag): number[] {
  return [
    GPX_DECIMAL.test(lon) ? Number(lon) : Number.NaN,
    GPX_DECIMAL.test(lat) ? Number(lat) : Number.NaN,
  ];
}

/** Where the markup that starts at `at` (a comment, CDATA or processing instruction) ends, or -1. */
function skipMarkup(text: string, at: number): number {
  const kinds: readonly (readonly [string, string])[] = [
    ["<!--", "-->"],
    ["<![CDATA[", "]]>"],
    ["<?", "?>"],
  ];
  for (const [start, stop] of kinds) {
    if (text.startsWith(start, at)) {
      const end = text.indexOf(stop, at + start.length);
      return end < 0 ? -1 : end + stop.length;
    }
  }
  return -2;
}

/** What the markup at a `<` is: skipped markup, an end tag or a start tag. */
type Tag =
  | { readonly kind: "skip"; readonly end: number }
  | { readonly kind: "close"; readonly name: string; readonly end: number }
  | {
      readonly kind: "open";
      readonly name: string;
      readonly start: StartTag;
    };

/** Reads the markup that starts at `at`; "damaged" is a fault in it, "unreadable" one in a start tag's attributes. */
function readTag(
  text: string,
  at: number,
  rootClosed: boolean,
): Tag | "damaged" | "unreadable" {
  const skipped = skipMarkup(text, at);
  if (skipped === -1) {
    return "damaged";
  }
  if (skipped >= 0) {
    return { kind: "skip", end: skipped };
  }
  if (text.startsWith("</", at)) {
    const name = matchAt(NAME, text, at + 2);
    const end = matchAt(SPACE, text, name.end).end;
    return name.value === "" || !text.startsWith(">", end)
      ? "damaged"
      : { kind: "close", name: name.value, end: end + 1 };
  }
  const name = matchAt(NAME, text, at + 1);
  if (name.value === "") {
    return "damaged";
  }
  const start = rootClosed ? null : readAttributes(text, name.end);
  return start === null
    ? "unreadable"
    : { kind: "open", name: name.value, start };
}

/** The elements open so far, and the line being collected, while GPX text is walked. */
class GpxWalker {
  private readonly stack: string[] = [];
  private line: number[][] | null = null;
  rootClosed = false;

  constructor(
    private readonly onGeometry: (geometry: GpxGeometry) => boolean,
  ) {}

  get depth(): number {
    return this.stack.length;
  }

  get openName(): string | undefined {
    return this.stack.at(-1);
  }

  /** How the text is faulty when it is damaged here: not GPX before the root closes with nothing open, else unreadable. */
  damaged(): GpxReading {
    return this.stack.length === 0 && !this.rootClosed
      ? "not-gpx"
      : "unreadable";
  }

  /** Opens an element; a reading to end with, or null to go on. */
  enter(name: string, start: StartTag): GpxReading | null {
    if (this.stack.length === 0 && name !== ROOT) {
      return "not-gpx";
    }
    this.stack.push(name);
    if (this.stack.length > MAX_GPX_DEPTH) {
      return "too-deep";
    }
    const path = this.stack.join("/");
    if (path === WAYPOINT) {
      const point = { type: "Point", coordinates: position(start) } as const;
      return this.onGeometry(point) ? null : "stopped";
    }
    if (LINE_POINTS.has(path)) {
      this.line = [];
    } else if (POINT_PATHS.has(path)) {
      this.line?.push(position(start));
    }
    return null;
  }

  /** Closes the open element; false when the caller asked to stop at the line it ended. */
  leave(): boolean {
    const path = this.stack.join("/");
    this.stack.pop();
    this.rootClosed = this.stack.length === 0;
    if (!LINE_POINTS.has(path) || this.line === null) {
      return true;
    }
    const finished = this.line;
    this.line = null;
    return this.onGeometry({ type: "LineString", coordinates: finished });
  }

  /** Takes in a tag: where to read on from, or the reading to end with. */
  apply(tag: Tag): number | GpxReading {
    switch (tag.kind) {
      case "skip":
        return tag.end;
      case "close":
        if (this.openName !== tag.name) {
          return this.damaged();
        }
        return this.leave() ? tag.end : "stopped";
      case "open": {
        const ended = this.enter(tag.name, tag.start);
        if (ended !== null) {
          return ended;
        }
        return tag.start.selfClosing && !this.leave()
          ? "stopped"
          : tag.start.end;
      }
    }
  }

  /** How reading ended once the text ran out. */
  finish(): GpxReading {
    if (this.stack.length > 0) {
      return "unreadable";
    }
    return this.rootClosed ? "ok" : "not-gpx";
  }
}

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
  const walker = new GpxWalker(onGeometry);
  let at = 0;
  while (at < text.length) {
    const lt = text.indexOf("<", at);
    const stop = lt < 0 ? text.length : lt;
    if (walker.depth === 0 && text.slice(at, stop).trim() !== "") {
      return walker.damaged();
    }
    if (lt < 0) {
      break;
    }
    const tag = readTag(text, lt, walker.rootClosed);
    if (tag === "damaged") {
      return walker.damaged();
    }
    if (tag === "unreadable") {
      return "unreadable";
    }
    const next = walker.apply(tag);
    if (typeof next === "string") {
      return next;
    }
    at = next;
  }
  return walker.finish();
}
