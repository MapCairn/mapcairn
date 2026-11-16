// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors

/** How serious a finding is. The command exits 2 on an error and 1 on a warning. */
export type Severity = "error" | "warning" | "info";

/** How sure a rule is that a finding is a real mistake and not valid, unusual data. */
export type Confidence = "high" | "medium" | "low";

/** One problem a rule found. */
export interface Finding {
  /** The stable id of the rule that found it. */
  readonly ruleId: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  /**
   * An RFC 6901 JSON pointer. A rule gives it relative to the feature it was
   * handed (`/geometry/coordinates/0/3`); the engine rewrites it to the
   * document before the finding leaves the library.
   */
  readonly path: string;
  /** A sentence for a person, in British English, without a trailing newline. */
  readonly message: string;
  /** Whether `--fix` can repair this finding. */
  readonly fixable: boolean;
  /** Machine-readable detail, such as an intersection point or candidate systems. */
  readonly data?: Readonly<Record<string, unknown>>;
}

/** A country's outline, as the region rules read it. See `region/`. */
export interface CountryIndex {
  /** Whether a position (longitude, latitude) is inside the country, within the coastline tolerance. */
  contains(code: string, longitude: number, latitude: number): boolean;
  /** Whether a country with this ISO 3166-1 alpha-2 code is known. */
  has(code: string): boolean;
  /**
   * The bounding box of every polygon of the country as `[west, south, east,
   * north]` in degrees, without the coastline tolerance; `undefined` for an
   * unknown code or a country with no polygon. A country that crosses the
   * antimeridian has a box that spans the whole range of longitudes.
   */
  bounds(code: string): readonly [number, number, number, number] | undefined;
  /**
   * The code of a country whose outline contains the position, with no
   * allowance for the coast, or undefined for open sea and for land the outlines
   * leave out (small islands, for one).
   */
  locate(longitude: number, latitude: number): string | undefined;
}

/** What a rule may know besides the feature itself. */
export interface RuleContext {
  /** Upper-case ISO 3166-1 alpha-2 codes given with `--region`; empty when none were. */
  readonly regions: readonly string[];
  /** Country outlines. Present only when `regions` is not empty. */
  readonly countries: CountryIndex | undefined;
}

/** The members of the document root that are not the `features` array. */
export interface DocumentInfo {
  /** The root `type` member, if it is a string. */
  readonly rootType: string | undefined;
  /** Every root member except `features`, parsed. */
  readonly members: Readonly<Record<string, unknown>>;
  /** Whether the root has a `features` member that is an array. */
  readonly hasFeatures: boolean;
  /**
   * Whether the root itself went to the rules as a feature: a Feature, or a bare
   * geometry wrapped in one. A rule that reads a feature's members has then
   * seen the root's, and a document check should not report them again.
   */
  readonly rootIsFeature: boolean;
  /**
   * The names of root members that appear more than once, each once, in the
   * order the second copy was read. For `features` only the first array is
   * checked; for any other name the last copy wins in `members`.
   */
  readonly duplicateMembers: readonly string[];
}

/**
 * A lint rule: a pure function from a feature (and a context) to findings, plus
 * the facts the CLI and the docs print about it.
 */
export interface Rule {
  /** A stable id such as `winding-order`. Never reused or renamed. */
  readonly id: string;
  /** The usual severity. A finding may lower or raise it. */
  readonly severity: Severity;
  /** The usual confidence. A finding may differ. */
  readonly confidence: Confidence;
  /** One line for `--rules`. */
  readonly summary: string;
  /** Whether `fix` repairs everything this rule reports. */
  readonly fixable: boolean;
  /** Whether the rule does nothing unless `--region` was given. */
  readonly needsRegion: boolean;
  /**
   * Checks one feature value as parsed from the input. It must tolerate any
   * JSON value (the `structure` rule reports malformed shapes; the others skip
   * what they cannot read) and must not throw or mutate the input.
   */
  readonly check: (
    feature: unknown,
    context: RuleContext,
  ) => readonly Finding[];
  /**
   * Checks the document root, for a rule about a member that is not part of a
   * feature (`crs`, the root `type`). Optional.
   */
  readonly checkDocument?: (
    document: DocumentInfo,
    context: RuleContext,
  ) => readonly Finding[];
  /**
   * Returns a repaired copy of the feature, or the same object when there is
   * nothing to repair. Never mutates its input. Present when `fixable` is true.
   */
  readonly fix?: (feature: unknown, context: RuleContext) => unknown;
}

/** A feature (or a bare geometry, wrapped) read from an input, with where it came from. */
export interface SourceFeature {
  /** The position of the feature in the input, from 0. */
  readonly index: number;
  /** The parsed JSON value of the feature. */
  readonly value: unknown;
  /** Turns a feature-relative pointer (`/geometry/...`) into one for the whole document. */
  readonly toDocumentPointer: (relative: string) => string;
}

/** An input that could not be read to its end. */
export interface InputError {
  readonly message: string;
  /** The byte offset where reading stopped. */
  readonly offset: number;
}

/** What a reader gives back for one input. */
export interface ReadResult {
  /** The features, in input order. Ends early, after an error is recorded in `done`, when the input is invalid. */
  readonly features: AsyncIterable<SourceFeature>;
  /** Resolves once `features` has been consumed: the document facts and any error. */
  readonly done: Promise<{
    readonly document: DocumentInfo;
    readonly error: InputError | undefined;
  }>;
}

/**
 * Reads one format. The rules never see the format: a reader turns bytes into
 * features, so NDJSON or TopoJSON can be added without touching a rule.
 */
export interface Reader {
  /** The format's name, such as `geojson`. */
  readonly format: string;
  read(chunks: AsyncIterable<Uint8Array>): ReadResult;
}
