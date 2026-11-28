// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/** The parts of the speed comparison that need no browser. */

/** One of the two builds a comparison measures. */
export type Build = "base" | "change";

/** One run's figures, in milliseconds, by measure. */
export type Sample = Readonly<Record<string, number>>;

/** What the command line asks for. */
export interface MeasureOptions {
  /** The address the earlier build is served at. */
  readonly base: string;
  /** The address the later build is served at. */
  readonly change: string;
  /** How many times each build is measured. */
  readonly rounds: number;
  /** How many times slower than the machine the page's processor runs. */
  readonly throttle: number;
}

const DEFAULT_ROUNDS = 7;
const DEFAULT_THROTTLE = 4;

const USAGE =
  "Usage: measure:speed -- --base <address> --change <address> [--rounds <count>] [--throttle <rate>]";

/** The value after a flag, if the flag is there. */
function flagValue(args: readonly string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

/** A whole number of at least one, or the fallback when none is given. */
function countOf(value: string | undefined, fallback: number): number {
  const count = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(USAGE);
  }
  return count;
}

/** @throws {Error} With the usage line, for a command line that does not fit it. */
export function measureOptions(args: readonly string[]): MeasureOptions {
  const base = flagValue(args, "--base");
  const change = flagValue(args, "--change");
  if (base === undefined || change === undefined) {
    throw new Error(USAGE);
  }
  return {
    base,
    change,
    rounds: countOf(flagValue(args, "--rounds"), DEFAULT_ROUNDS),
    throttle: countOf(flagValue(args, "--throttle"), DEFAULT_THROTTLE),
  };
}

/**
 * The order of the runs: each round measures both builds, and the one that
 * goes first changes from round to round, so a machine that slows down or
 * speeds up over the run does so to both.
 */
export function runOrder(rounds: number): Build[] {
  return Array.from({ length: rounds }, (_, round): Build[] =>
    round % 2 === 0 ? ["base", "change"] : ["change", "base"],
  ).flat();
}

/** The middle of some figures, with their lowest and highest. */
export function summarise(values: readonly number[]): {
  median: number;
  low: number;
  high: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const [low] = sorted;
  const high = sorted.at(-1);
  if (low === undefined || high === undefined) {
    throw new Error("There are no samples to summarise.");
  }
  const half = (sorted.length - 1) / 2;
  const lower = sorted[Math.floor(half)] ?? low;
  const upper = sorted[Math.ceil(half)] ?? high;
  return { median: (lower + upper) / 2, low, high };
}

/** A Markdown table of each measure: the median and the range for each build. */
export function summaryTable(
  measures: readonly string[],
  samples: Readonly<Record<Build, readonly Sample[]>>,
): string {
  const cell = (build: Build, measure: string) => {
    const { median, low, high } = summarise(
      samples[build].map((sample) => sample[measure] ?? Number.NaN),
    );
    return `${Math.round(median)} (${Math.round(low)} to ${Math.round(high)})`;
  };
  const rows = [
    ["Measure", "Base (ms)", "Change (ms)"],
    ...measures.map((measure) => [
      measure,
      cell("base", measure),
      cell("change", measure),
    ]),
  ];
  const widths = [0, 1, 2].map((column) =>
    // A column of figures keeps a space of room, so most runs line up.
    Math.max(
      ...rows.map((row) => (row[column]?.length ?? 0) + (column > 0 ? 1 : 0)),
    ),
  );
  const line = (row: readonly string[]) =>
    `| ${row.map((value, column) => value.padEnd(widths[column] ?? 0)).join(" | ")} |`;
  const [header = [], ...body] = rows;
  return [
    line(header),
    line(widths.map((width) => "-".repeat(width))),
    ...body.map(line),
  ].join("\n");
}
