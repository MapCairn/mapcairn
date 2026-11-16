// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import type {
  DocumentInfo,
  InputError,
  Reader,
  ReadResult,
  SourceFeature,
} from "../types.js";
import {
  type ElementEvent,
  type MemberEvent,
  type SplitEvent,
  splitJson,
} from "./jsonSplitter.js";

const FEATURES_KEY = "features";
const FEATURE_TYPE = "Feature";
const GEOMETRY_PREFIX = "/geometry";
const GEOMETRY_TYPES: ReadonlySet<string> = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

/** The outcome `done` resolves with. */
type Outcome = Awaited<ReadResult["done"]>;

type Parsed =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Decodes and parses one piece. It never throws; a failure says what failed. */
function parseSlice(bytes: Uint8Array, label: string): Parsed {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return { ok: false, message: `Invalid UTF-8 in ${label}.` };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const message =
      error instanceof RangeError
        ? `The nesting in ${label} is too deep to read.`
        : `Invalid JSON in ${label}.`;
    return { ok: false, message };
  }
}

function featurePointer(index: number): (relative: string) => string {
  return (relative) => `/${FEATURES_KEY}/${index}${relative}`;
}

function identityPointer(relative: string): string {
  return relative;
}

/**
 * Maps a pointer into the Feature wrapped around a bare geometry back to the
 * document, where the geometry is the root. The wrapper's own members
 * (`type`, `properties`) are not in the document, so they map to the root.
 */
function geometryPointer(relative: string): string {
  if (relative === GEOMETRY_PREFIX) {
    return "";
  }
  if (relative.startsWith(`${GEOMETRY_PREFIX}/`)) {
    return relative.slice(GEOMETRY_PREFIX.length);
  }
  return "";
}

function describeElement(event: ElementEvent): string {
  if (event.key === undefined) {
    return `element ${event.index} of the root array`;
  }
  return `${event.key}[${event.index}]`;
}

function describeMember(event: MemberEvent): string {
  return `the "${event.key}" member`;
}

/** What one read has seen of the document so far. */
class GeoJsonSession {
  /** The first problem found, if any. Once set, nothing more is accepted. */
  error: InputError | undefined;
  private readonly entries: [string, unknown][] = [];
  private members: Readonly<Record<string, unknown>> | undefined;
  private featuresSeen = false;
  private hasFeatures = false;
  private yielding = false;
  private rootIsFeature = false;
  private readonly names = new Set<string>();
  private readonly repeated: string[] = [];

  /** Takes one event. Returns the feature it completes, if it completes one. */
  accept(event: SplitEvent): SourceFeature | undefined {
    switch (event.kind) {
      case "error":
        this.error = { message: event.message, offset: event.offset };
        return undefined;
      case "arrayStart":
        this.startArray(event.key);
        return undefined;
      case "element":
        return this.acceptElement(event);
      case "member":
        this.acceptMember(event);
        return undefined;
      case "value":
        this.parse(event.bytes, event.offset, "the root value");
        return undefined;
    }
  }

  /**
   * The root as a feature, for a root that is a Feature or a bare geometry and
   * has no `features` array. Call it only after the input ended without error.
   */
  rootFeature(): SourceFeature | undefined {
    if (this.hasFeatures) {
      return undefined;
    }
    const root = this.rootMembers();
    const type = root.type;
    if (type === FEATURE_TYPE) {
      this.rootIsFeature = true;
      return { index: 0, value: root, toDocumentPointer: identityPointer };
    }
    if (typeof type === "string" && GEOMETRY_TYPES.has(type)) {
      this.rootIsFeature = true;
      return {
        index: 0,
        value: { type: FEATURE_TYPE, properties: null, geometry: root },
        toDocumentPointer: geometryPointer,
      };
    }
    return undefined;
  }

  /** The document facts gathered so far. */
  document(): DocumentInfo {
    const members = this.rootMembers();
    const type = members.type;
    return {
      rootType: typeof type === "string" ? type : undefined,
      members,
      hasFeatures: this.hasFeatures,
      rootIsFeature: this.rootIsFeature,
      duplicateMembers: this.repeated,
    };
  }

  private rootMembers(): Readonly<Record<string, unknown>> {
    this.members ??= Object.fromEntries(this.entries);
    return this.members;
  }

  /** Remembers a root member name, and which names came twice. */
  private noteName(key: string): void {
    if (!this.names.has(key)) {
      this.names.add(key);
      return;
    }
    if (!this.repeated.includes(key)) {
      this.repeated.push(key);
    }
  }

  private startArray(key: string | undefined): void {
    if (key !== undefined) {
      this.noteName(key);
    }
    const isFeatures = key === FEATURES_KEY && !this.featuresSeen;
    if (key === FEATURES_KEY) {
      this.featuresSeen = true;
    }
    this.hasFeatures ||= isFeatures;
    this.yielding = isFeatures;
  }

  private acceptElement(event: ElementEvent): SourceFeature | undefined {
    const parsed = this.parse(
      event.bytes,
      event.offset,
      describeElement(event),
    );
    if (!parsed.ok || !this.yielding) {
      return undefined;
    }
    return {
      index: event.index,
      value: parsed.value,
      toDocumentPointer: featurePointer(event.index),
    };
  }

  private acceptMember(event: MemberEvent): void {
    const parsed = this.parse(event.bytes, event.offset, describeMember(event));
    if (!parsed.ok) {
      return;
    }
    this.noteName(event.key);
    if (event.key === FEATURES_KEY) {
      if (this.featuresSeen) {
        return;
      }
      this.featuresSeen = true;
    }
    this.members = undefined;
    this.entries.push([event.key, parsed.value]);
  }

  private parse(bytes: Uint8Array, offset: number, label: string): Parsed {
    const parsed = parseSlice(bytes, label);
    if (!parsed.ok) {
      this.error = { message: parsed.message, offset };
    }
    return parsed;
  }
}

const FINISHED: IteratorReturnResult<undefined> = {
  done: true,
  value: undefined,
};

/**
 * The features of one document, read on demand: one asynchronous step per
 * chunk of input, and a synchronous queue for the features that chunk held.
 * It ends at the first problem, after the features read before it.
 */
class FeatureStream implements AsyncIterator<SourceFeature, undefined> {
  private queue: SourceFeature[] = [];
  private position = 0;
  private finished = false;

  constructor(
    private readonly batches: AsyncGenerator<
      readonly SplitEvent[],
      void,
      undefined
    >,
    private readonly session: GeoJsonSession,
    private readonly settle: () => void,
  ) {}

  async next(): Promise<IteratorResult<SourceFeature, undefined>> {
    while (this.position >= this.queue.length) {
      if (this.finished) {
        this.settle();
        return FINISHED;
      }
      await this.refill();
    }
    const feature = this.queue[this.position] as SourceFeature;
    this.position += 1;
    return { done: false, value: feature };
  }

  /** Stops early: releases the input and settles `done`. */
  async return(): Promise<IteratorResult<SourceFeature, undefined>> {
    this.finished = true;
    this.queue = [];
    await this.batches.return(undefined);
    this.settle();
    return FINISHED;
  }

  private async refill(): Promise<void> {
    const batch = await this.batches.next();
    this.queue = [];
    this.position = 0;
    if (batch.done) {
      this.finished = true;
      this.queueRoot();
      return;
    }
    for (const event of batch.value) {
      const feature = this.session.accept(event);
      if (this.session.error !== undefined) {
        this.finished = true;
        await this.batches.return(undefined);
        return;
      }
      if (feature !== undefined) {
        this.queue.push(feature);
      }
    }
  }

  private queueRoot(): void {
    const root = this.session.rootFeature();
    if (root !== undefined) {
      this.queue.push(root);
    }
  }
}

function readGeoJson(chunks: AsyncIterable<Uint8Array>): ReadResult {
  const session = new GeoJsonSession();
  let resolve!: (outcome: Outcome) => void;
  const done = new Promise<Outcome>((resolveDone) => {
    resolve = resolveDone;
  });
  let settled = false;
  const settle = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    resolve({ document: session.document(), error: session.error });
  };
  const stream = new FeatureStream(
    splitJson(chunks, { streamKey: FEATURES_KEY }),
    session,
    settle,
  );
  return { features: { [Symbol.asyncIterator]: () => stream }, done };
}

/**
 * Reads GeoJSON (RFC 7946) as a stream. The `features` of a FeatureCollection
 * are yielded one at a time as they are read, so memory follows the largest
 * feature and not the file. A Feature, or a bare geometry wrapped in a
 * Feature, is yielded once the whole document has been read. Other roots
 * yield no features, and a rule reports the structure.
 *
 * `done` resolves, and never rejects, once `features` has been consumed or
 * closed: iterate `features` before awaiting it. A problem with the input ends
 * the iteration after the features that were read before it, and arrives as
 * the `error` of `done`.
 */
export const geoJsonReader: Reader = {
  format: "geojson",
  read: readGeoJson,
};
