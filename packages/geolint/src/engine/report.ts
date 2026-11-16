// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import type { LintReport } from "./lint.js";
import type { Finding, InputError, Severity } from "./types.js";

/** The report for one named input. */
export interface FileReport {
  /** The name shown to the user: a path, or `<stdin>`. */
  readonly file: string;
  readonly report: LintReport;
  /** Things to tell the user besides findings, such as where a fixed copy was written. */
  readonly notes?: readonly string[];
}

/** How many findings there are of each severity. */
export interface Summary {
  readonly files: number;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  /** How many inputs could not be read to the end. */
  readonly unreadable: number;
}

/** The exit codes of the command. */
export const EXIT = {
  clean: 0,
  warnings: 1,
  errors: 2,
  unreadable: 3,
} as const;

function count(findings: readonly Finding[], severity: Severity): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

/** Totals across the reports. */
export function summarise(reports: readonly FileReport[]): Summary {
  const findings = reports.flatMap((entry) => entry.report.findings);
  return {
    files: reports.length,
    errors: count(findings, "error"),
    warnings: count(findings, "warning"),
    infos: count(findings, "info"),
    unreadable: reports.filter((entry) => entry.report.inputError !== undefined)
      .length,
  };
}

/**
 * The exit code for the reports: 3 when any input was unreadable or invalid, 2
 * when there is an error, 1 when there are only warnings, otherwise 0. Findings
 * of `info` severity never change the code.
 */
export function exitCodeFor(reports: readonly FileReport[]): number {
  const summary = summarise(reports);
  if (summary.unreadable > 0) {
    return EXIT.unreadable;
  }
  if (summary.errors > 0) {
    return EXIT.errors;
  }
  return summary.warnings > 0 ? EXIT.warnings : EXIT.clean;
}

function plural(amount: number, word: string): string {
  return `${amount} ${word}${amount === 1 ? "" : "s"}`;
}

const NEWLINE = 0x0a;
const SPACE = 0x20;
const DELETE = 0x7f;
const LAST_C1_CONTROL = 0x9f;
const TAB = 0x09;
const HEX = 16;

function isControl(code: number): boolean {
  return code < SPACE || (code >= DELETE && code <= LAST_C1_CONTROL);
}

function escapeControl(code: number): string {
  if (code === NEWLINE) {
    return "\\n";
  }
  if (code === TAB) {
    return "\\t";
  }
  return `\\x${code.toString(HEX).padStart(2, "0")}`;
}

/**
 * Replaces control characters (an escape sequence in a `crs` name that a message
 * echoes, a newline in a file name) with `\xNN`, `\n` or `\t`, so that text output
 * cannot move the cursor, change colours or split a finding over two lines.
 */
function printable(text: string): string {
  let result = "";
  for (const character of text) {
    result += isControl(character.charCodeAt(0))
      ? escapeControl(character.charCodeAt(0))
      : character;
  }
  return result;
}

function findingLine(file: string, finding: Finding): string {
  const place = finding.path === "" ? "(document)" : printable(finding.path);
  return `${printable(file)}: ${finding.severity} ${finding.ruleId} (${finding.confidence} confidence) ${place} ${printable(finding.message)}`;
}

function inputErrorLine(file: string, error: InputError): string {
  const where = error.offset === 0 ? "" : ` past byte ${error.offset}`;
  return `${printable(file)}: error invalid-input could not be read${where}: ${printable(error.message)}`;
}

/**
 * Plain text, one line for each finding and a summary line, the order that the
 * reports were given in. A line has the file, the severity, the rule id, the
 * confidence, the JSON pointer and the message, so it greps well.
 */
export function formatText(reports: readonly FileReport[]): string {
  const lines: string[] = [];
  for (const { file, report } of reports) {
    for (const finding of report.findings) {
      lines.push(findingLine(file, finding));
    }
    if (report.inputError) {
      lines.push(inputErrorLine(file, report.inputError));
    }
  }
  const summary = summarise(reports);
  const unreadable =
    summary.unreadable > 0 ? `, ${summary.unreadable} unreadable` : "";
  lines.push(
    `${plural(summary.errors, "error")}, ${plural(summary.warnings, "warning")}, ${summary.infos} info${unreadable} in ${plural(summary.files, "file")}.`,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * Machine-readable JSON with a version number, one entry for each file and a
 * summary. The shape is the package's public output format.
 */
export function formatJson(reports: readonly FileReport[]): string {
  const body = {
    version: 1,
    files: reports.map(({ file, report }) => ({
      file,
      featureCount: report.featureCount,
      findings: report.findings,
      inputError: report.inputError ?? null,
    })),
    summary: summarise(reports),
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}
