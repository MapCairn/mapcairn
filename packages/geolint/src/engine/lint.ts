// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { geoJsonReader } from "./reader/geojson.js";
import { rules as allRules } from "./rules/index.js";
import type {
  CountryIndex,
  DocumentInfo,
  Finding,
  InputError,
  Reader,
  Rule,
  RuleContext,
  SourceFeature,
} from "./types.js";

/** Supplies the country outlines. Called at most once, and only when a region was given. */
export type CountryLoader = () => Promise<CountryIndex>;

/** What to lint with. Every member is optional. */
export interface LintOptions {
  /** ISO 3166-1 alpha-2 codes of the countries the data should be in, in any case. */
  readonly regions?: readonly string[];
  /** Rule ids to leave out. */
  readonly ignore?: readonly string[];
  /** The rules to run, in order. Defaults to every rule. */
  readonly rules?: readonly Rule[];
  /** Loads the country outlines. Required when `regions` is not empty. */
  readonly countries?: CountryLoader;
  /** The format reader. Defaults to GeoJSON. */
  readonly reader?: Reader;
}

/** The outcome of linting one input. */
export interface LintReport {
  /** Every finding, in a stable order: document position, then rule id, then message. */
  readonly findings: readonly Finding[];
  /** How many features were read. */
  readonly featureCount: number;
  /**
   * Set when the input could not be read to its end. Findings for the features
   * read before it are still given; the document-level checks are not run, as
   * the root may be only partly read.
   */
  readonly inputError: InputError | undefined;
}

/** Thrown for a request the engine cannot honour, such as a region it has no outline for. */
export class LintUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LintUsageError";
  }
}

/** The rules left after removing the ignored ids. Throws on an id that is not a rule. */
export function activeRules(
  all: readonly Rule[],
  ignore: readonly string[],
): readonly Rule[] {
  const known = new Set(all.map((rule) => rule.id));
  const unknown = ignore.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new LintUsageError(`Unknown rule id: ${unknown.join(", ")}.`);
  }
  const skipped = new Set(ignore);
  return all.filter((rule) => !skipped.has(rule.id));
}

/** Splits a JSON pointer into comparable parts. */
function segments(path: string): string[] {
  return path === "" ? [] : path.slice(1).split("/");
}

const NUMERIC = /^\d+$/;

/** Orders two JSON pointers by document position: array indices compare as numbers. */
export function comparePaths(a: string, b: string): number {
  const left = segments(a);
  const right = segments(b);
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i++) {
    const x = left[i] as string;
    const y = right[i] as string;
    if (x === y) {
      continue;
    }
    if (NUMERIC.test(x) && NUMERIC.test(y)) {
      return Number(x) - Number(y);
    }
    return x < y ? -1 : 1;
  }
  return left.length - right.length;
}

function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** The total order findings are reported in, so that output does not vary between runs. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    comparePaths(a.path, b.path) ||
    compareText(a.ruleId, b.ruleId) ||
    compareText(a.message, b.message)
  );
}

/** Runs each rule on one feature. Paths in the findings are relative to the feature. */
export function lintFeature(
  value: unknown,
  context: RuleContext,
  rules: readonly Rule[],
): Finding[] {
  return rules.flatMap((rule) => rule.check(value, context));
}

function documentFindings(
  document: DocumentInfo,
  context: RuleContext,
  rules: readonly Rule[],
): Finding[] {
  return rules.flatMap((rule) => rule.checkDocument?.(document, context) ?? []);
}

/** Builds the context, loading the country outlines only when a region was asked for. */
export async function buildContext(options: LintOptions): Promise<RuleContext> {
  const regions = [
    ...new Set((options.regions ?? []).map((code) => code.toUpperCase())),
  ].sort();
  if (regions.length === 0) {
    return { regions, countries: undefined };
  }
  if (options.countries === undefined) {
    throw new LintUsageError(
      "A region was given but no country data was supplied.",
    );
  }
  const countries = await options.countries();
  const unknown = regions.filter((code) => !countries.has(code));
  if (unknown.length > 0) {
    throw new LintUsageError(
      `No outline for region ${unknown.join(", ")}. Use an ISO 3166-1 alpha-2 code such as ZA or FR.`,
    );
  }
  return { regions, countries };
}

function withDocumentPaths(
  source: SourceFeature,
  findings: Finding[],
): Finding[] {
  return findings.map((finding) => ({
    ...finding,
    path: source.toDocumentPointer(finding.path),
  }));
}

/**
 * Lints one input: reads it as a stream of features, runs every active rule on
 * each, and returns the findings sorted. Memory use follows the largest
 * feature, not the input, apart from the findings themselves.
 */
export async function lintBytes(
  chunks: AsyncIterable<Uint8Array>,
  options: LintOptions = {},
): Promise<LintReport> {
  const rules = activeRules(options.rules ?? allRules, options.ignore ?? []);
  const context = await buildContext(options);
  const reader = options.reader ?? geoJsonReader;
  const result = reader.read(chunks);
  const findings: Finding[] = [];
  let featureCount = 0;
  for await (const source of result.features) {
    featureCount += 1;
    findings.push(
      ...withDocumentPaths(source, lintFeature(source.value, context, rules)),
    );
  }
  const { document, error } = await result.done;
  if (error === undefined) {
    findings.push(...documentFindings(document, context, rules));
  }
  findings.sort(compareFindings);
  return { findings, featureCount, inputError: error };
}

/** Lints text held in memory. A convenience over `lintBytes`, for tests and small inputs. */
export function lintText(
  text: string,
  options: LintOptions = {},
): Promise<LintReport> {
  const bytes = new TextEncoder().encode(text);
  return lintBytes(
    (async function* () {
      yield bytes;
    })(),
    options,
  );
}
