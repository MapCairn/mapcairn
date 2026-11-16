// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors

/**
 * An incremental scanner that cuts the top-level JSON value of a document into
 * pieces without decoding or parsing it.
 *
 * The structural bytes of JSON are ASCII, and no byte of a multi-byte UTF-8
 * sequence is below 0x80, so the scan runs on raw bytes. It tracks only
 * strings, escapes and nesting depth. Each piece is handed over as raw bytes;
 * whoever consumes it decodes and parses it, so a malformed piece is that
 * consumer's to report. The scanner itself holds nothing but the piece it is
 * assembling, so memory follows the largest piece and not the input.
 */

/** Counters a caller may pass in to see what a split cost. */
export interface SplitStats {
  /**
   * The most bytes the splitter copied into its own buffer for one piece. It
   * stays zero while every piece lies inside a single chunk, because such a
   * piece is a view of the chunk and is not copied.
   */
  peakBufferedBytes: number;
}

/** Options for {@link splitJson}. */
export interface SplitOptions {
  /**
   * A root member name. Each root member with this name whose value is an
   * array is streamed one element at a time (an `arrayStart` event, then an
   * `element` event for each element) instead of being handed over whole.
   */
  readonly streamKey?: string;
  /** Updated while the split runs. */
  readonly stats?: SplitStats;
}

/**
 * The whole root value when it is a string, number or literal. The root
 * object and the root array are reported through their members and elements.
 */
export interface ValueEvent {
  readonly kind: "value";
  /** The raw bytes. */
  readonly bytes: Uint8Array;
  /** The byte offset in the input where the value starts. */
  readonly offset: number;
}

/** One member of the root object whose value is not streamed. */
export interface MemberEvent {
  readonly kind: "member";
  /** The member name, decoded. */
  readonly key: string;
  /** The raw bytes of the value. */
  readonly bytes: Uint8Array;
  /** The byte offset in the input where the value starts. */
  readonly offset: number;
}

/** A streamed array began: a root member named by `streamKey`, or the root array itself. */
export interface ArrayStartEvent {
  readonly kind: "arrayStart";
  /** The member name, or undefined for an array at the root of the document. */
  readonly key: string | undefined;
  /** The byte offset in the input of the opening bracket. */
  readonly offset: number;
}

/** One element of a streamed array. */
export interface ElementEvent {
  readonly kind: "element";
  /** The member name of the array, or undefined for an array at the root. */
  readonly key: string | undefined;
  /** The position of the element in its array, from 0. */
  readonly index: number;
  /** The raw bytes of the element. */
  readonly bytes: Uint8Array;
  /** The byte offset in the input where the element starts. */
  readonly offset: number;
}

/** The input is not a complete JSON document. This is always the last event. */
export interface SplitErrorEvent {
  readonly kind: "error";
  readonly message: string;
  /** The byte offset where reading stopped. */
  readonly offset: number;
}

/** What {@link splitJson} yields, in input order. */
export type SplitEvent =
  | ValueEvent
  | MemberEvent
  | ArrayStartEvent
  | ElementEvent
  | SplitErrorEvent;

const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const SPACE = 0x20;
const QUOTE = 0x22;
const COMMA = 0x2c;
const COLON = 0x3a;
const OPEN_BRACKET = 0x5b;
const BACKSLASH = 0x5c;
const CLOSE_BRACKET = 0x5d;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const DELETE = 0x7f;
const BYTE_ORDER_MARK = Uint8Array.of(0xef, 0xbb, 0xbf);
const HEX_RADIX = 16;
const HEX_WIDTH = 2;
const MIN_BUFFER_BYTES = 256;
const NO_STOP = -1;

const TRUNCATED_MESSAGE = "The input ends before the root value is closed.";

/** Where the grammar is, between the pieces the scanner assembles. */
const State = {
  Start: 0,
  ObjectFirst: 1,
  ObjectKey: 2,
  Colon: 3,
  MemberValue: 4,
  AfterMember: 5,
  ArrayFirst: 6,
  ArrayNext: 7,
  AfterElement: 8,
  End: 9,
} as const;
type State = (typeof State)[keyof typeof State];

/** What a piece is, which decides the event it becomes. */
const Purpose = { Key: 0, Member: 1, Element: 2, Root: 3 } as const;
type Purpose = (typeof Purpose)[keyof typeof Purpose];

/** How the end of a piece is found. */
const ScanKind = { String: 0, Container: 1, Scalar: 2 } as const;
type ScanKind = (typeof ScanKind)[keyof typeof ScanKind];

const keyDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const EMPTY_BUFFER = new Uint8Array(0);

function isWhitespace(byte: number): boolean {
  return (
    byte === SPACE ||
    byte === LINE_FEED ||
    byte === CARRIAGE_RETURN ||
    byte === TAB
  );
}

function endsScalar(byte: number): boolean {
  return (
    isWhitespace(byte) ||
    byte === COMMA ||
    byte === CLOSE_BRACKET ||
    byte === CLOSE_BRACE
  );
}

/** 1 for a byte that cannot change the state outside a string, 0 for a quote or bracket. */
const IS_PLAIN = new Uint8Array(256).fill(1);
for (const byte of [
  QUOTE,
  OPEN_BRACE,
  OPEN_BRACKET,
  CLOSE_BRACE,
  CLOSE_BRACKET,
]) {
  IS_PLAIN[byte] = 0;
}

/** The index of the first byte at or after `from` that is a quote or a bracket, or `end`. */
function skipPlain(chunk: Uint8Array, from: number, end: number): number {
  let index = from;
  while (index < end && IS_PLAIN[chunk[index] as number] === 1) {
    index += 1;
  }
  return index;
}

/** The index of the next `byte` at or after `from`, or `end` when there is none. */
function indexFrom(
  chunk: Uint8Array,
  byte: number,
  from: number,
  end: number,
): number {
  const found = chunk.indexOf(byte, from);
  return found === -1 ? end : found;
}

function describeByte(byte: number): string {
  if (byte > SPACE && byte < DELETE) {
    return `'${String.fromCharCode(byte)}'`;
  }
  return `byte 0x${byte.toString(HEX_RADIX).padStart(HEX_WIDTH, "0")}`;
}

/** The state machine. It is fed chunks and leaves events in a queue. */
class Scanner {
  private readonly streamKey: string | undefined;
  private readonly stats: SplitStats | undefined;
  private events: SplitEvent[] = [];

  /** The absolute offset of the first byte of the chunk being scanned. */
  private base = 0;
  private bomProgress = 0;
  private bomDone = false;
  private failed = false;

  private state: State = State.Start;
  /** The name of the member being read, then of the streamed array. */
  private key: string | undefined;
  private arrayKey: string | undefined;
  private elementIndex = 0;

  private scanning = false;
  private purpose: Purpose = Purpose.Root;
  private kind: ScanKind = ScanKind.Scalar;
  private depth = 0;
  private inString = false;
  private escaped = false;
  /** Where the next quote and backslash are in the current chunk, or -1 before they are searched for. */
  private quoteAt = -1;
  private backslashAt = -1;
  private valueOffset = 0;
  /** Where in the current chunk the bytes not yet copied begin. */
  private segmentStart = 0;
  private buffer: Uint8Array = EMPTY_BUFFER;
  private bufferLength = 0;

  constructor(streamKey: string | undefined, stats: SplitStats | undefined) {
    this.streamKey = streamKey;
    this.stats = stats;
  }

  /** Whether an error has ended the scan. */
  get isFailed(): boolean {
    return this.failed;
  }

  /** Returns the events since the last call and clears the queue. */
  take(): SplitEvent[] {
    const taken = this.events;
    this.events = [];
    return taken;
  }

  /** Scans one chunk. */
  push(chunk: Uint8Array): void {
    const end = chunk.length;
    this.quoteAt = -1;
    this.backslashAt = -1;
    let index = this.skipByteOrderMark(chunk);
    while (index < end && !this.failed) {
      index = this.scanning
        ? this.scanValue(chunk, index, end)
        : this.step(chunk, index);
    }
    if (this.scanning) {
      this.append(chunk, this.segmentStart, end);
      this.segmentStart = 0;
    }
    this.base += end;
  }

  /** Records that the input ends here, and whether that is an error. */
  finish(): void {
    if (this.scanning) {
      this.finishScanning();
      return;
    }
    switch (this.state) {
      case State.End:
        return;
      case State.Start:
        this.fail(
          this.bomProgress > 0 && !this.bomDone
            ? "The input ends inside a byte order mark."
            : "The input is empty.",
          this.base,
        );
        return;
      case State.ObjectFirst:
      case State.ObjectKey:
      case State.Colon:
      case State.MemberValue:
      case State.AfterMember:
      case State.ArrayFirst:
      case State.ArrayNext:
      case State.AfterElement:
        this.fail(TRUNCATED_MESSAGE, this.base);
        return;
    }
  }

  /** Records that the source of the chunks failed. */
  abort(reason: unknown): void {
    const detail = reason instanceof Error ? reason.message : String(reason);
    this.fail(`The input could not be read: ${detail}`, this.base);
  }

  private fail(message: string, offset: number): void {
    this.failed = true;
    this.scanning = false;
    this.events.push({ kind: "error", message, offset });
  }

  private unexpected(byte: number, index: number, expected: string): number {
    this.fail(
      `Unexpected ${describeByte(byte)}; expected ${expected}.`,
      this.base + index,
    );
    return index + 1;
  }

  /** Steps over a leading UTF-8 byte order mark, which may span chunks. */
  private skipByteOrderMark(chunk: Uint8Array): number {
    let index = 0;
    while (!this.bomDone && !this.failed && index < chunk.length) {
      if (chunk[index] === BYTE_ORDER_MARK[this.bomProgress]) {
        index += 1;
        this.bomProgress += 1;
        this.bomDone = this.bomProgress === BYTE_ORDER_MARK.length;
      } else if (this.bomProgress > 0) {
        this.fail(
          "The input starts with an invalid byte order mark.",
          this.base + index,
        );
      } else {
        this.bomDone = true;
      }
    }
    return index;
  }

  /** Reads one byte of structure between pieces. Returns the next index. */
  private step(chunk: Uint8Array, index: number): number {
    const byte = chunk[index] as number;
    if (isWhitespace(byte)) {
      return index + 1;
    }
    switch (this.state) {
      case State.Start:
        return this.stepStart(byte, index);
      case State.ObjectFirst:
        if (byte === CLOSE_BRACE) {
          this.state = State.End;
          return index + 1;
        }
        return this.stepKey(byte, index, 'a member name or "}"');
      case State.ObjectKey:
        return this.stepKey(byte, index, "a member name");
      case State.Colon:
        if (byte === COLON) {
          this.state = State.MemberValue;
          return index + 1;
        }
        return this.unexpected(byte, index, '":"');
      case State.MemberValue:
        if (byte === OPEN_BRACKET && this.key === this.streamKey) {
          return this.beginArray(this.key, index);
        }
        return this.stepValue(byte, index, Purpose.Member);
      case State.AfterMember:
        if (byte === COMMA) {
          this.state = State.ObjectKey;
          return index + 1;
        }
        if (byte === CLOSE_BRACE) {
          this.state = State.End;
          return index + 1;
        }
        return this.unexpected(byte, index, '"," or "}"');
      case State.ArrayFirst:
        if (byte === CLOSE_BRACKET) {
          return this.closeArray(index);
        }
        return this.stepValue(byte, index, Purpose.Element);
      case State.ArrayNext:
        return this.stepValue(byte, index, Purpose.Element);
      case State.AfterElement:
        if (byte === COMMA) {
          this.state = State.ArrayNext;
          return index + 1;
        }
        if (byte === CLOSE_BRACKET) {
          return this.closeArray(index);
        }
        return this.unexpected(byte, index, '"," or "]"');
      case State.End:
        this.fail(
          `Unexpected ${describeByte(byte)} after the end of the root value.`,
          this.base + index,
        );
        return index + 1;
    }
  }

  private stepStart(byte: number, index: number): number {
    if (byte === OPEN_BRACE) {
      this.state = State.ObjectFirst;
      return index + 1;
    }
    if (byte === OPEN_BRACKET) {
      return this.beginArray(undefined, index);
    }
    return this.stepValue(byte, index, Purpose.Root);
  }

  private stepKey(byte: number, index: number, expected: string): number {
    if (byte === QUOTE) {
      return this.beginScan(Purpose.Key, ScanKind.String, index);
    }
    return this.unexpected(byte, index, expected);
  }

  /** Starts a piece: a string, an object or array, or a number or literal. */
  private stepValue(byte: number, index: number, purpose: Purpose): number {
    switch (byte) {
      case QUOTE:
        return this.beginScan(purpose, ScanKind.String, index);
      case OPEN_BRACE:
      case OPEN_BRACKET:
        return this.beginScan(purpose, ScanKind.Container, index);
      case COMMA:
      case COLON:
      case CLOSE_BRACKET:
      case CLOSE_BRACE:
        return this.unexpected(byte, index, "a JSON value");
      default:
        return this.beginScan(purpose, ScanKind.Scalar, index);
    }
  }

  private beginArray(key: string | undefined, index: number): number {
    this.events.push({ kind: "arrayStart", key, offset: this.base + index });
    this.state = State.ArrayFirst;
    this.arrayKey = key;
    this.elementIndex = 0;
    return index + 1;
  }

  private closeArray(index: number): number {
    this.state = this.arrayKey === undefined ? State.End : State.AfterMember;
    return index + 1;
  }

  /** Starts assembling a piece whose first byte is at `index`. */
  private beginScan(purpose: Purpose, kind: ScanKind, index: number): number {
    this.scanning = true;
    this.purpose = purpose;
    this.kind = kind;
    this.depth = kind === ScanKind.Container ? 1 : 0;
    this.inString = kind === ScanKind.String;
    this.escaped = false;
    this.valueOffset = this.base + index;
    this.segmentStart = index;
    this.bufferLength = 0;
    return index + 1;
  }

  /** Scans inside a piece. Returns the next index: the chunk end when the piece goes on. */
  private scanValue(chunk: Uint8Array, start: number, end: number): number {
    const stop =
      this.kind === ScanKind.Scalar
        ? this.findScalarEnd(chunk, start, end)
        : this.findNestedEnd(chunk, start, end);
    if (stop === NO_STOP) {
      return end;
    }
    this.finishValue(chunk, stop);
    return stop;
  }

  /**
   * The index just past the closing quote or bracket, or NO_STOP. Outside a
   * string it skips the bytes that cannot change the state; inside one it
   * jumps between quotes and backslashes (see `scanString`).
   */
  private findNestedEnd(chunk: Uint8Array, start: number, end: number): number {
    let index = start;
    while (index < end) {
      if (this.inString) {
        index = this.scanString(chunk, index, end);
        if (!this.inString && this.depth === 0) {
          return index;
        }
      } else {
        index = skipPlain(chunk, index, end);
        if (index < end) {
          index += 1;
          if (this.applyStructural(chunk[index - 1] as number)) {
            return index;
          }
        }
      }
    }
    return NO_STOP;
  }

  /**
   * Applies a quote or bracket seen outside a string. Returns whether it
   * closed the piece.
   */
  private applyStructural(byte: number): boolean {
    if (byte === QUOTE) {
      this.inString = true;
      return false;
    }
    if (byte === OPEN_BRACE || byte === OPEN_BRACKET) {
      this.depth += 1;
      return false;
    }
    this.depth -= 1;
    return this.depth === 0;
  }

  /**
   * Moves through a string with the engine's native search for the next quote
   * and the next backslash. The positions found are kept for the whole chunk
   * until the scan passes them, so no byte of a chunk is searched twice,
   * however many pieces the chunk holds. Returns the next index; clears
   * `inString` when the closing quote was passed.
   */
  private scanString(chunk: Uint8Array, index: number, end: number): number {
    if (this.escaped) {
      this.escaped = false;
      return index + 1;
    }
    if (this.quoteAt < index) {
      this.quoteAt = indexFrom(chunk, QUOTE, index, end);
    }
    if (this.backslashAt < index) {
      this.backslashAt = indexFrom(chunk, BACKSLASH, index, end);
    }
    if (this.backslashAt < this.quoteAt) {
      this.escaped = true;
      return this.backslashAt + 1;
    }
    if (this.quoteAt === end) {
      return end;
    }
    this.inString = false;
    return this.quoteAt + 1;
  }

  /** The index of the byte that ends a number or literal, or NO_STOP. */
  private findScalarEnd(chunk: Uint8Array, start: number, end: number): number {
    for (let index = start; index < end; index += 1) {
      if (endsScalar(chunk[index] as number)) {
        return index;
      }
    }
    return NO_STOP;
  }

  /** Copies `chunk[from, to)` onto the end of the piece buffer. */
  private append(chunk: Uint8Array, from: number, to: number): void {
    const needed = this.bufferLength + (to - from);
    if (needed > this.buffer.length) {
      const grown = new Uint8Array(
        Math.max(needed, this.buffer.length * 2, MIN_BUFFER_BYTES),
      );
      grown.set(this.buffer.subarray(0, this.bufferLength));
      this.buffer = grown;
    }
    this.buffer.set(chunk.subarray(from, to), this.bufferLength);
    this.bufferLength = needed;
    if (this.stats !== undefined && needed > this.stats.peakBufferedBytes) {
      this.stats.peakBufferedBytes = needed;
    }
  }

  /**
   * The raw bytes of the piece that ended at `stop` in `chunk`. A piece inside
   * one chunk is a view of it. A longer one is handed over from the buffer,
   * which the scanner then forgets, so a queued event is never overwritten.
   */
  private takeBytes(chunk: Uint8Array, stop: number): Uint8Array {
    if (this.bufferLength === 0) {
      return chunk.subarray(this.segmentStart, stop);
    }
    this.append(chunk, this.segmentStart, stop);
    const bytes = this.buffer.subarray(0, this.bufferLength);
    this.buffer = EMPTY_BUFFER;
    this.bufferLength = 0;
    return bytes;
  }

  private finishValue(chunk: Uint8Array, stop: number): void {
    const bytes = this.takeBytes(chunk, stop);
    const offset = this.valueOffset;
    this.scanning = false;
    switch (this.purpose) {
      case Purpose.Key:
        this.finishKey(bytes, offset);
        return;
      case Purpose.Member:
        this.state = State.AfterMember;
        this.events.push({
          kind: "member",
          key: this.key as string,
          bytes,
          offset,
        });
        return;
      case Purpose.Element:
        this.state = State.AfterElement;
        this.events.push({
          kind: "element",
          key: this.arrayKey,
          index: this.elementIndex,
          bytes,
          offset,
        });
        this.elementIndex += 1;
        return;
      case Purpose.Root:
        this.state = State.End;
        this.events.push({ kind: "value", bytes, offset });
        return;
    }
  }

  private finishKey(bytes: Uint8Array, offset: number): void {
    try {
      this.key = JSON.parse(keyDecoder.decode(bytes)) as string;
      this.state = State.Colon;
    } catch {
      this.fail("A member name is not a valid JSON string.", offset);
    }
  }

  /** The input ends while a piece is being assembled. */
  private finishScanning(): void {
    if (this.kind === ScanKind.Scalar && this.purpose === Purpose.Root) {
      this.finishValue(EMPTY_BUFFER, 0);
      return;
    }
    if (this.inString) {
      this.fail("The input ends inside an unterminated string.", this.base);
      return;
    }
    const message =
      this.kind === ScanKind.Scalar
        ? TRUNCATED_MESSAGE
        : "The input ends inside an unclosed array or object.";
    this.fail(message, this.base);
  }
}

/**
 * Cuts the top-level value of a JSON document into raw pieces, in input order:
 * the members of a root object, the elements of a streamed array, or the whole
 * value when the root is a scalar. Each yield is the batch of events one chunk
 * completed, so a consumer pays for one asynchronous step per chunk and not
 * per piece. A batch is never empty.
 *
 * The events never throw. Invalid structure ends the stream with one `error`
 * event, after the pieces that were complete before it; a failure of the
 * source ends it the same way. Closing the iterator early closes the source.
 * The pieces are not parsed here, so a piece may still be invalid JSON. Their
 * bytes are views of the chunks or buffers the splitter no longer touches, so
 * they stay valid as long as the source does not reuse its chunks.
 *
 * The scan is linear in the input. Memory is the chunk being scanned plus a
 * copy of the piece that spans chunks, so it follows the largest piece.
 */
export async function* splitJson(
  chunks: AsyncIterable<Uint8Array>,
  options: SplitOptions = {},
): AsyncGenerator<readonly SplitEvent[], void, undefined> {
  const scanner = new Scanner(options.streamKey, options.stats);
  try {
    for await (const chunk of chunks) {
      scanner.push(chunk);
      const batch = scanner.take();
      if (batch.length > 0) {
        yield batch;
      }
      if (scanner.isFailed) {
        return;
      }
    }
    scanner.finish();
  } catch (error) {
    scanner.abort(error);
  }
  const last = scanner.take();
  if (last.length > 0) {
    yield last;
  }
}
