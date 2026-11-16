// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { availableParallelism } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  activeRules,
  buildContext,
  LintUsageError,
  lintBytes,
} from "../engine/lint.js";
import { loadCountries } from "../engine/regions/index.js";
import {
  EXIT,
  exitCodeFor,
  type FileReport,
  formatJson,
  formatText,
} from "../engine/report.js";
import { rules } from "../engine/rules/index.js";
import { formatSarif } from "../engine/sarif.js";
import { expandInputs, NoMatchError, STDIN } from "../node/files.js";
import { type FileTask, lintFile } from "../node/lintFile.js";
import { mapInThreads } from "../node/pool.js";

/** The output formats the command can write. */
export const FORMATS = ["text", "json", "sarif"] as const;

/** Everything the command needs from its surroundings, so a test can supply fakes. */
export interface CliIo {
  readonly stdout: { write(text: string): void };
  readonly stderr: { write(text: string): void };
  /** The bytes of standard input. Called only when `-` is an input. */
  readonly stdin: () => AsyncIterable<Uint8Array>;
  /** The directory globs and relative paths are read from. */
  readonly cwd: string;
  /** The worker script for `--jobs`. Defaults to the one beside this file. */
  readonly workerUrl?: URL;
}

const USAGE = `Usage: geolint [options] <file|glob|-> [...]

Lints GeoJSON for the mistakes people make beyond schema validation.

Options:
  --format <text|json|sarif>   How to print findings (default text)
  --region <code>        ISO 3166-1 alpha-2 country the data should be in; repeat for several
  --ignore <rule-id>     Leave a rule out; repeat for several
  --jobs <n>             Lint files in n worker threads (default: the number of processors)
  --fix                  Write <name>.fixed.geojson with the safe repairs applied (the original is not changed)
  --rules                List the rules and exit
  --help                 Show this help

Use - to read standard input. Exit codes: 0 clean, 1 warnings only, 2 errors,
3 unreadable or invalid input, or a request that could not be understood.
`;

interface Parsed {
  readonly inputs: readonly string[];
  readonly format: (typeof FORMATS)[number];
  readonly regions: readonly string[];
  readonly ignore: readonly string[];
  readonly jobs: number;
  readonly fix: boolean;
  readonly listRules: boolean;
  readonly help: boolean;
}

function parseJobs(raw: string | undefined): number {
  if (raw === undefined) {
    return availableParallelism();
  }
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new LintUsageError("--jobs needs a whole number of at least 1.");
  }
  return Number(raw);
}

function parseFormat(raw: string | undefined): Parsed["format"] {
  const format = FORMATS.find((candidate) => candidate === (raw ?? "text"));
  if (format === undefined) {
    throw new LintUsageError(
      `Unknown format ${raw}. Use one of: ${FORMATS.join(", ")}.`,
    );
  }
  return format;
}

function parse(argv: readonly string[]): Parsed {
  let values: ReturnType<typeof parseArgs>["values"];
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        format: { type: "string" },
        region: { type: "string", multiple: true },
        ignore: { type: "string", multiple: true },
        jobs: { type: "string" },
        fix: { type: "boolean" },
        rules: { type: "boolean" },
        help: { type: "boolean" },
      },
    }));
  } catch (error) {
    throw new LintUsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
  return {
    inputs: positionals,
    format: parseFormat(values.format as string | undefined),
    regions: (values.region as string[] | undefined) ?? [],
    ignore: (values.ignore as string[] | undefined) ?? [],
    jobs: parseJobs(values.jobs as string | undefined),
    fix: values.fix === true,
    listRules: values.rules === true,
    help: values.help === true,
  };
}

/** The `--rules` listing: one line for each rule. */
export function formatRules(): string {
  const lines = rules.map((rule) => {
    const notes = [
      rule.fixable ? "fixable" : undefined,
      rule.needsRegion ? "needs --region" : undefined,
    ].filter((note) => note !== undefined);
    const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";
    return `${rule.id.padEnd(22)} ${rule.severity.padEnd(8)} ${rule.confidence.padEnd(7)} ${rule.summary}${suffix}`;
  });
  return `${lines.join("\n")}\n`;
}

async function lintAll(
  files: readonly string[],
  parsed: Parsed,
  io: CliIo,
): Promise<FileReport[]> {
  const tasks: FileTask[] = files
    .filter((file) => file !== STDIN)
    .map((file) => ({
      file,
      path: path.resolve(io.cwd, file),
      regions: parsed.regions,
      ignore: parsed.ignore,
      fix: parsed.fix,
    }));
  const lintedFiles =
    parsed.jobs > 1 && tasks.length > 1
      ? await mapInThreads<FileTask, FileReport>(
          io.workerUrl ?? new URL("./worker.js", import.meta.url),
          tasks,
          parsed.jobs,
        )
      : await Promise.all(tasks.map((task) => lintFile(task)));
  let nextFile = 0;
  const reports: FileReport[] = [];
  for (const file of files) {
    if (file === STDIN) {
      const report = await lintBytes(io.stdin(), {
        regions: parsed.regions,
        ignore: parsed.ignore,
        countries: loadCountries,
      });
      reports.push({ file: "<stdin>", report });
      continue;
    }
    reports.push(lintedFiles[nextFile] as FileReport);
    nextFile += 1;
  }
  return reports;
}

function render(
  format: Parsed["format"],
  reports: readonly FileReport[],
): string {
  switch (format) {
    case "json":
      return formatJson(reports);
    case "sarif":
      return formatSarif(reports, rules);
    case "text":
      return formatText(reports);
  }
}

/**
 * The whole command, apart from process wiring: parses the arguments, lints the
 * inputs, writes the report and returns the exit code. It never calls
 * `process.exit`, so tests call it directly and the `bin` shim passes the code on.
 */
export async function main(
  argv: readonly string[],
  io: CliIo,
): Promise<number> {
  try {
    const parsed = parse(argv);
    if (parsed.help) {
      io.stdout.write(USAGE);
      return EXIT.clean;
    }
    if (parsed.listRules) {
      io.stdout.write(formatRules());
      return EXIT.clean;
    }
    if (parsed.inputs.length === 0) {
      io.stderr.write(`geolint: no input given.\n\n${USAGE}`);
      return EXIT.unreadable;
    }
    if (parsed.fix && parsed.inputs.includes(STDIN)) {
      throw new LintUsageError(
        "--fix writes a file next to the input, so it cannot be used with standard input.",
      );
    }
    activeRules(rules, parsed.ignore);
    await buildContext({ regions: parsed.regions, countries: loadCountries });
    const files = await expandInputs(parsed.inputs, io.cwd);
    const reports = await lintAll(files, parsed, io);
    for (const note of reports.flatMap((entry) => entry.notes ?? [])) {
      io.stderr.write(`${note}
`);
    }
    io.stdout.write(render(parsed.format, reports));
    return exitCodeFor(reports);
  } catch (error) {
    if (error instanceof LintUsageError || error instanceof NoMatchError) {
      io.stderr.write(`geolint: ${error.message}\n`);
      return EXIT.unreadable;
    }
    throw error;
  }
}
