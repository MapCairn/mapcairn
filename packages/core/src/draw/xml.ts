// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

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

/** A parsed start tag: where it ends, whether it closes itself, and the two attributes a GPX position needs. */
export interface StartTag {
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

const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";

/** Where the markup that starts at `at` (a comment, CDATA or processing instruction) ends, or -1. */
function skipMarkup(text: string, at: number): number {
  const kinds: readonly (readonly [string, string])[] = [
    ["<!--", "-->"],
    [CDATA_OPEN, CDATA_CLOSE],
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

/**
 * How walking XML text ended: `ok` (all of it was read), `stopped` (the
 * handler asked to stop), `foreign` (the text is not a document whose root the
 * handler accepts), `unreadable` (it starts as one but is damaged) or
 * `too-deep`.
 */
export type XmlReading =
  | "ok"
  | "stopped"
  | "foreign"
  | "unreadable"
  | "too-deep";

/** What a format reads from the elements {@link walkXml} meets. */
export interface XmlHandler {
  /** How many elements may be open at once; one more is `too-deep`. */
  readonly maxDepth: number;
  /** Whether an element with this name, as written, may be the root. */
  isRoot(name: string): boolean;
  /** An element opened; `path` holds the names open, it last. False stops the walk. */
  open(path: readonly string[], start: StartTag): boolean;
  /** An element is about to close; `path` holds the names open, it last. False stops the walk. */
  close(path: readonly string[]): boolean;
  /** Whether the text and CDATA directly inside the open element are wanted. */
  wantsText(): boolean;
  /** A piece of the wanted text; a CDATA section arrives as it is, without its markers. */
  characters(piece: string): void;
}

/** The elements open so far, and the handler they are reported to, while XML text is walked. */
class XmlWalk {
  private readonly path: string[] = [];
  private rootClosed = false;

  constructor(private readonly handler: XmlHandler) {}

  get depth(): number {
    return this.path.length;
  }

  /** How the text is faulty when it is damaged here: foreign before the root closes with nothing open, else unreadable. */
  damaged(): XmlReading {
    return this.path.length === 0 && !this.rootClosed
      ? "foreign"
      : "unreadable";
  }

  /** Whether text directly inside the open element is wanted. */
  wantsText(): boolean {
    return this.path.length > 0 && this.handler.wantsText();
  }

  get isRootClosed(): boolean {
    return this.rootClosed;
  }

  characters(piece: string): void {
    this.handler.characters(piece);
  }

  private leave(): boolean {
    const goOn = this.handler.close(this.path);
    this.path.pop();
    this.rootClosed = this.path.length === 0;
    return goOn;
  }

  /** Takes in a tag: where to read on from, or the reading to end with. */
  apply(tag: Tag): number | XmlReading {
    switch (tag.kind) {
      case "skip":
        return tag.end;
      case "close":
        if (this.path.at(-1) !== tag.name) {
          return this.damaged();
        }
        return this.leave() ? tag.end : "stopped";
      case "open": {
        if (this.path.length === 0 && !this.handler.isRoot(tag.name)) {
          return "foreign";
        }
        this.path.push(tag.name);
        if (this.path.length > this.handler.maxDepth) {
          return "too-deep";
        }
        if (!this.handler.open(this.path, tag.start)) {
          return "stopped";
        }
        return tag.start.selfClosing && !this.leave()
          ? "stopped"
          : tag.start.end;
      }
    }
  }

  /** How reading ended once the text ran out. */
  finish(): XmlReading {
    if (this.path.length > 0) {
      return "unreadable";
    }
    return this.rootClosed ? "ok" : "foreign";
  }
}

/**
 * Walks XML text element by element and tells `handler` what it meets, in
 * file order.
 *
 * @remarks A hand-written scan, not an XML parser: it needs no library or
 *   `DOMParser`, and each character is read a fixed number of times, so the
 *   work is linear in the text. Entities are never expanded and nothing
 *   external is fetched; attribute values and text are passed on as written.
 *   A `DOCTYPE` makes the text foreign, because the root must come first.
 *   Names are matched as written. The text must be well formed as far as
 *   elements go: a tag left open, closed twice or out of order is
 *   `unreadable`.
 */
export function walkXml(text: string, handler: XmlHandler): XmlReading {
  const walk = new XmlWalk(handler);
  let at = 0;
  while (at < text.length) {
    const lt = text.indexOf("<", at);
    const stop = lt < 0 ? text.length : lt;
    const between = text.slice(at, stop);
    if (walk.depth === 0 && between.trim() !== "") {
      return walk.damaged();
    }
    if (walk.wantsText()) {
      walk.characters(between);
    }
    if (lt < 0) {
      break;
    }
    if (walk.wantsText() && text.startsWith(CDATA_OPEN, lt)) {
      const end = text.indexOf(CDATA_CLOSE, lt + CDATA_OPEN.length);
      if (end < 0) {
        return "unreadable";
      }
      walk.characters(text.slice(lt + CDATA_OPEN.length, end));
      at = end + CDATA_CLOSE.length;
      continue;
    }
    const tag = readTag(text, lt, walk.isRootClosed);
    if (tag === "damaged") {
      return walk.damaged();
    }
    if (tag === "unreadable") {
      return "unreadable";
    }
    const next = walk.apply(tag);
    if (typeof next === "string") {
      return next;
    }
    at = next;
  }
  return walk.finish();
}
