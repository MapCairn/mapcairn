// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entryPointsOf, ROLLUP_COMPILER_OPTIONS } from "./buildPackage.mjs";
import { SDK_BUILD_ORDER } from "./buildSdk.mjs";
import { isEntryPoint } from "./entryPoint.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The folder of a package that holds its committed API reports. */
export const REPORT_FOLDER = "api";

/** The file ending of an API report. */
const REPORT_SUFFIX = ".api.md";

/**
 * The TSDoc configuration API Extractor reads from the project folder: its
 * own tags plus `@since`, which the documentation site shows on a page.
 */
const TSDOC_CONFIG = {
  $schema:
    "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
  extends: ["@microsoft/api-extractor/extends/tsdoc-base.json"],
  tagDefinitions: [{ tagName: "@since", syntaxKind: "block" }],
  supportForTags: { "@since": true },
};

/** The file ending of the API model API Extractor writes beside a report. */
const MODEL_SUFFIX = ".api.json";

/**
 * Message ids that are reported, as warnings. Everything else API Extractor
 * can say is left off: this check is about the public surface and its
 * documentation, not about the rest of its rule set.
 *
 * - `ae-undocumented`: an export with no TSDoc.
 * - `ae-forgotten-export`: an export that names a type the entry point does
 *   not export. The report keeps this one, so it shows in the diff.
 * - `ae-unresolved-link`: a `{@link}` that points at nothing.
 */
/** @type {Record<string, any>} */
const REPORTED_MESSAGES = {
  "ae-undocumented": { logLevel: "warning", addToApiReportFile: false },
  "ae-forgotten-export": { logLevel: "warning", addToApiReportFile: true },
  "ae-unresolved-link": { logLevel: "warning", addToApiReportFile: false },
  "ae-wrong-input-file-type": { logLevel: "error" },
};

/**
 * Whether a report's text matches another's, whatever line endings a checkout
 * gave the committed file.
 *
 * @param {string} text
 * @returns {string}
 */
function normalised(text) {
  return text.replaceAll("\r\n", "\n");
}

/**
 * Runs API Extractor over the built, rolled-up declarations of each entry
 * point of a package and returns the reports it would write, with every
 * message it printed. The declarations are what a host installs, so the
 * report describes the shipped surface. Nothing is written into the package.
 *
 * @param {string} folder The package folder, with its `dist` built.
 * @returns {Promise<{
 *   reports: Map<string, string>,
 *   models: Map<string, string>,
 *   messages: Array<{ id: string, text: string, file: string | undefined, line: number | undefined }>,
 * }>} The report text and the API model (the JSON the documentation site
 *   reads) for each entry point name, and the messages.
 */
export async function generateReports(folder) {
  const { Extractor, ExtractorConfig, ExtractorLogLevel } = await import(
    "@microsoft/api-extractor"
  );
  const manifestPath = path.join(folder, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const scratch = mkdtempSync(path.join(tmpdir(), "mapcairn-api-"));
  /** @type {Map<string, string>} */
  const reports = new Map();
  /** @type {Map<string, string>} */
  const models = new Map();
  /** @type {Array<{ id: string, text: string, file: string | undefined, line: number | undefined }>} */
  const messages = [];
  try {
    for (const name of Object.keys(entryPointsOf(manifest.exports ?? {}))) {
      const declaration = path.join(folder, "dist", `${name}.d.ts`);
      if (!existsSync(declaration)) {
        throw new Error(
          `${declaration} does not exist: run "npm run build:sdk" first.`,
        );
      }
      // The declaration is read from the scratch folder, outside the package,
      // so the package's own name (which a rolled-up entry point may import
      // for the types it shares with the main entry) is external rather than
      // the main entry's file read in again as a local module.
      const copied = path.join(scratch, name, `${name}.d.ts`);
      mkdirSync(path.dirname(copied), { recursive: true });
      copyFileSync(declaration, copied);
      // A star re-export of another package (the umbrella's) is resolved to
      // list its names, so the scratch folder finds the workspace's packages.
      symlinkSync(
        path.join(REPO, "node_modules"),
        path.join(scratch, name, "node_modules"),
        "junction",
      );
      // The project folder is the scratch one, so API Extractor finds the TSDoc
      // configuration written into it. It stops looking at a folder that holds
      // a package.json, so the scratch folder holds an empty one.
      writeFileSync(path.join(scratch, name, "package.json"), "{}");
      writeFileSync(
        path.join(scratch, name, "tsdoc.json"),
        JSON.stringify(TSDOC_CONFIG),
      );
      const reportFolder = path.join(scratch, name, "report");
      const tempFolder = path.join(scratch, name, "temp");
      mkdirSync(reportFolder, { recursive: true });
      const config = ExtractorConfig.prepare({
        configObjectFullPath: undefined,
        packageJsonFullPath: manifestPath,
        configObject: {
          projectFolder: path.join(scratch, name),
          newlineKind: "lf",
          mainEntryPointFilePath: copied,
          compiler: {
            overrideTsconfig: {
              compilerOptions: ROLLUP_COMPILER_OPTIONS,
            },
          },
          apiReport: {
            enabled: true,
            reportFileName: `${name}${REPORT_SUFFIX}`,
            reportFolder,
            reportTempFolder: tempFolder,
          },
          docModel: {
            enabled: true,
            apiJsonFilePath: path.join(reportFolder, `${name}${MODEL_SUFFIX}`),
          },
          dtsRollup: { enabled: false },
          tsdocMetadata: { enabled: false },
          messages: {
            compilerMessageReporting: {
              default: { logLevel: ExtractorLogLevel.Warning },
            },
            extractorMessageReporting: {
              default: { logLevel: ExtractorLogLevel.None },
              ...REPORTED_MESSAGES,
            },
            tsdocMessageReporting: {
              default: {
                logLevel: ExtractorLogLevel.Warning,
                addToApiReportFile: false,
              },
            },
          },
        },
      });
      Extractor.invoke(config, {
        // A local build does not fail on a warning. The report is read from
        // the temporary folder it is always written to, and compared here.
        localBuild: true,
        showVerboseMessages: false,
        messageCallback: (message) => {
          message.handled = true;
          if (
            message.category === "console" ||
            message.logLevel === "none" ||
            message.logLevel === "verbose"
          ) {
            return;
          }
          messages.push({
            id: String(message.messageId),
            text: message.text,
            file: message.sourceFilePath,
            line: message.sourceFileLine,
          });
        },
      });
      reports.set(
        name,
        readFileSync(path.join(tempFolder, `${name}${REPORT_SUFFIX}`), "utf8"),
      );
      models.set(
        name,
        readFileSync(path.join(reportFolder, `${name}${MODEL_SUFFIX}`), "utf8"),
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return { reports, models, messages };
}

/**
 * Compares the generated reports with the files committed under the package's
 * `api` folder.
 *
 * @param {string} folder The package folder.
 * @param {Map<string, string>} reports Report text by entry point name.
 * @returns {{ missing: string[], changed: string[], stale: string[] }} File
 *   names: reports not committed, reports whose text differs, and committed
 *   reports with no entry point.
 */
export function compareReports(folder, reports) {
  const reportFolder = path.join(folder, REPORT_FOLDER);
  const missing = [];
  const changed = [];
  for (const [name, text] of reports) {
    const file = `${name}${REPORT_SUFFIX}`;
    const target = path.join(reportFolder, file);
    if (!existsSync(target)) {
      missing.push(file);
    } else if (normalised(readFileSync(target, "utf8")) !== normalised(text)) {
      changed.push(file);
    }
  }
  const wanted = new Set(
    [...reports.keys()].map((n) => `${n}${REPORT_SUFFIX}`),
  );
  const stale = existsSync(reportFolder)
    ? readdirSync(reportFolder).filter((file) => !wanted.has(file))
    : [];
  return { missing, changed, stale };
}

/**
 * Writes the reports into the package's `api` folder and removes a committed
 * report that has no entry point.
 *
 * @param {string} folder The package folder.
 * @param {Map<string, string>} reports Report text by entry point name.
 */
export function writeReports(folder, reports) {
  const reportFolder = path.join(folder, REPORT_FOLDER);
  mkdirSync(reportFolder, { recursive: true });
  const { stale } = compareReports(folder, reports);
  for (const file of stale) {
    rmSync(path.join(reportFolder, file));
  }
  for (const [name, text] of reports) {
    writeFileSync(
      path.join(reportFolder, `${name}${REPORT_SUFFIX}`),
      normalised(text),
    );
  }
}

/**
 * Counts messages by id.
 *
 * @param {Array<{ id: string }>} messages
 * @returns {Map<string, number>}
 */
export function summariseMessages(messages) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const { id } of messages) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** The most changed lines `changedLines` returns, so a log stays short. */
const MAX_CHANGED_LINES = 40;

/**
 * The lines that differ between two reports, as `-` for a line only in the
 * committed report and `+` for one only in the new one. A line is matched by
 * its text, so a moved line shows nothing; the report is sorted, so a real
 * change shows. The list is cut at `limit` with a count of the rest.
 *
 * @param {string} committed
 * @param {string} generated
 * @param {number} [limit]
 * @returns {string[]}
 */
export function changedLines(committed, generated, limit = MAX_CHANGED_LINES) {
  const before = normalised(committed).split("\n");
  const after = normalised(generated).split("\n");
  const kept = new Set(before);
  const present = new Set(after);
  const lines = [
    ...before.filter((line) => !present.has(line)).map((l) => `- ${l}`),
    ...after.filter((line) => !kept.has(line)).map((l) => `+ ${l}`),
  ];
  return lines.length > limit
    ? [...lines.slice(0, limit), `... and ${lines.length - limit} more lines`]
    : lines;
}

/**
 * Prints the messages of one package and a count of each kind. In a GitHub
 * Actions run the counts also become one warning annotation, so they show on
 * the run without hundreds of annotations (GitHub shows ten).
 *
 * @param {string} name The package folder name.
 * @param {Array<{ id: string, text: string, file: string | undefined, line: number | undefined }>} messages
 * @param {boolean} verbose Whether to list every message.
 */
function printMessages(name, messages, verbose) {
  if (verbose && messages.length > 0) {
    console.log(`::group::@mapcairn/${name} documentation warnings`);
    for (const message of messages) {
      const where = message.file
        ? ` (${path.relative(REPO, message.file)}${message.line ? `:${message.line}` : ""})`
        : "";
      console.log(`${message.id}: ${message.text}${where}`);
    }
    console.log("::endgroup::");
  }
  const counts = [...summariseMessages(messages)]
    .map(([id, count]) => `${count} ${id}`)
    .join(", ");
  console.log(`@mapcairn/${name}: ${counts || "no warnings"}.`);
  if (counts && process.env.GITHUB_ACTIONS === "true") {
    console.log(
      `::warning title=API documentation::@mapcairn/${name}: ${counts}.`,
    );
  }
}

/**
 * Runs the check or the update over the four SDK packages and prints what it
 * finds. Warnings never change the result; a report that differs from the
 * committed file does, in `check` mode.
 *
 * @param {"check" | "update"} mode
 * @param {boolean} [verbose] List every warning, not only the counts.
 * @returns {Promise<boolean>} Whether every report matches (always true when
 *   updating).
 */
export async function run(mode, verbose = false) {
  let clean = true;
  for (const name of SDK_BUILD_ORDER) {
    const folder = path.join(REPO, "packages", name);
    const { reports, messages } = await generateReports(folder);
    printMessages(name, messages, verbose);
    if (mode === "update") {
      writeReports(folder, reports);
      continue;
    }
    const { missing, changed, stale } = compareReports(folder, reports);
    for (const [kind, files] of [
      ["not committed", missing],
      ["out of date", changed],
      ["no such entry point", stale],
    ]) {
      for (const file of files) {
        clean = false;
        const target = path.join(folder, REPORT_FOLDER, file);
        console.error(`packages/${name}/${REPORT_FOLDER}/${file}: ${kind}.`);
        if (files === changed) {
          const lines = changedLines(
            readFileSync(target, "utf8"),
            reports.get(file.slice(0, -REPORT_SUFFIX.length)) ?? "",
          );
          console.error(lines.join("\n"));
        }
      }
    }
  }
  if (!clean) {
    console.error(
      'The public API changed. Run "npm run api:update", read the diff of packages/*/api, and commit it.',
    );
  }
  return clean;
}

if (isEntryPoint(import.meta.url)) {
  const [mode, flag] = process.argv.slice(2);
  if (
    (mode !== "check" && mode !== "update") ||
    (flag && flag !== "--verbose")
  ) {
    console.error(
      "Usage: node scripts/apiReports.mjs check|update [--verbose]",
    );
    process.exit(2);
  }
  process.exit((await run(mode, flag === "--verbose")) ? 0 : 1);
}
