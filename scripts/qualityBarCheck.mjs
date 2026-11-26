// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Warns when a pull request lowers the quality bar, which AGENTS.md ("Never":
 * weaken an assertion, or exclude code from coverage, to make a check pass)
 * otherwise leaves to the reviewer. It reads the pull request's diff and flags
 * an added suppression comment (`biome-ignore`, `@ts-ignore`,
 * `@ts-expect-error`, `eslint-disable`), an added skipped or focused test, a
 * deleted test file or test case, a changed test file with fewer `expect(`
 * calls than before, and a known coverage, Lighthouse or size bar that got
 * weaker (`BARS`).
 *
 *   PR_TITLE=... PR_BODY=... PR_AUTHOR=... PR_LABELS=... BASE_REF=main \
 *     node scripts/qualityBarCheck.mjs
 *
 * It only ever warns (exit code 0, see `SEVERITY`): each finding is an
 * annotation on its file and line and a line in the job summary. A finding the
 * description acknowledges, by naming the file or the words "quality bar", is
 * a notice instead. Dependabot and Release pull requests are skipped, and so is
 * a run whose base branch cannot be read. The only program it runs is `git`.
 * The text arrives through the environment, so it is data and never part of a
 * shell command.
 */
import { appendFileSync } from "node:fs";
import { escapeAnnotation } from "./apiBreakingCheck.mjs";
import { isEntryPoint } from "./entryPoint.mjs";
import { skipReason } from "./prBodyCheck.mjs";
import { git } from "./release/tools.mjs";

/**
 * Whether a finding fails the pull request (`error`) or only annotates it
 * (`warning`). It warns: see the measurement in the pull request that added
 * the check for the false-positive rate that would justify an error.
 */
export const SEVERITY = "warning";

/** What a finding asks of the author. */
const ASK = "say why in the pull request";
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SUPPRESSION =
  /(?:\/\/|\/\*|\*)\s*(?:biome-ignore|@ts-ignore|@ts-expect-error|eslint-disable)\b/;
const SKIPPED_TEST =
  /\b(?:it|test|describe)(?:\.describe)?\.(?:skip|todo|fixme|only)\s*\(/;
const TEST_CASE =
  /^\s*(?:it|test)(?:\.(?:each|skip|only|fixme|todo|fails|concurrent))*\s*\(/;
const SCRIPT_IMPORT = /\bfrom\s+["'][^"']*\.[cm]js["']/;
const EXPECT_CALL = /\bexpect\s*\(/g;
const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * The configuration files that hold a quality bar, kept to the ones that are
 * clearly one. `line` captures the key and the number. A `floor` weakens when
 * the number falls (coverage, a Lighthouse score), a `ceiling` when it rises
 * (a size budget).
 *
 * @type {{ what: string, file: RegExp, line: RegExp, direction: "floor" | "ceiling" }[]}
 */
export const BARS = [
  {
    what: "coverage threshold",
    file: /^vitest\.config\.ts$/,
    line: /^\s*(statements|branches|functions|lines):\s*(\d+)/,
    direction: "floor",
  },
  {
    what: "Lighthouse minimum score",
    file: /(?:^|\/)lighthouserc\.json$/,
    line: /"(categories:[\w-]+)":\s*\["\w+",\s*\{\s*"minScore":\s*([\d.]+)/,
    direction: "floor",
  },
  {
    what: "size budget",
    file: /^scripts\/release\/(?:packCheck|consumerCheck)\.mjs$/,
    line: /^\s*("[^"]+"|\w+):\s*(\d[\d_]{3,}),?\s*$/,
    direction: "ceiling",
  },
  {
    what: "size budget",
    file: /^sites\/docs\/scripts\/(?:verifyBuild|markdownCopies|repositoryDocParts)\.ts$/,
    line: /export const (\w*(?:BUDGET|CEILING)\w*)\s*=\s*(\d[\d_]*);/,
    direction: "ceiling",
  },
];

/**
 * @typedef {{ line: number, text: string }} DiffLine
 * @typedef {{ path: string, deleted: boolean, added: DiffLine[], removed: DiffLine[] }} FileChange
 * @typedef {{ file: string, line: number, rule: string, message: string }} Finding
 */

/**
 * @param {string} marker The `---` or `+++` line's path field.
 * @returns {string} The path without its `a/` or `b/` prefix and a trailing tab.
 */
function headerPath(marker) {
  return marker.replace(/\t.*$/, "").replace(/^[ab]\//, "");
}

/**
 * Reads a zero-context unified diff. A removed line is placed at the line of
 * the new file where it was taken out, so a finding can be opened.
 *
 * @param {string} diff
 * @returns {FileChange[]}
 */
export function parseDiff(diff) {
  /** @type {FileChange[]} */
  const files = [];
  /** @type {FileChange | undefined} */
  let file;
  let oldPath = "";
  let deleted = false;
  let oldLeft = 0;
  let newLeft = 0;
  let newLine = 0;
  for (const text of diff.split("\n")) {
    if (oldLeft > 0 || newLeft > 0) {
      if (text.startsWith("-")) {
        oldLeft -= 1;
        file?.removed.push({ line: newLine, text: text.slice(1) });
      } else if (text.startsWith("+")) {
        newLeft -= 1;
        file?.added.push({ line: newLine, text: text.slice(1) });
        newLine += 1;
      }
      continue;
    }
    const hunk = HUNK_HEADER.exec(text);
    if (hunk) {
      oldLeft = Number(hunk[1] ?? 1);
      newLine = Number(hunk[2]);
      newLeft = Number(hunk[3] ?? 1);
    } else if (text.startsWith("diff --git ")) {
      deleted = false;
    } else if (text.startsWith("deleted file mode")) {
      deleted = true;
    } else if (text.startsWith("--- ")) {
      oldPath = headerPath(text.slice(4));
    } else if (text.startsWith("+++ ")) {
      file = {
        path: deleted ? oldPath : headerPath(text.slice(4)),
        deleted,
        added: [],
        removed: [],
      };
      files.push(file);
    }
  }
  return files;
}

/**
 * @param {string} text
 * @returns {number} How many `expect(` calls the text holds.
 */
function expectCalls(text) {
  return text.match(EXPECT_CALL)?.length ?? 0;
}

/**
 * @param {DiffLine[]} lines
 * @returns {number}
 */
function countExpects(lines) {
  return lines.reduce((sum, { text }) => sum + expectCalls(text), 0);
}

/**
 * @param {string} path
 * @param {DiffLine} line
 * @param {string} rule
 * @param {string} message
 * @returns {Finding}
 */
function finding(path, line, rule, message) {
  return { file: path, line: line.line, rule, message };
}

/**
 * Whether a suppression is the `@ts-expect-error` that stands above the import
 * of a JavaScript script, which has no types and which every test of a script
 * writes (`packages/core/src/lint`). It lowers nothing.
 *
 * @param {string} text The suppression line.
 * @param {string | undefined} next The added line after it.
 * @returns {boolean}
 */
function isScriptImportMarker(text, next) {
  return (
    text.includes("@ts-expect-error") &&
    next !== undefined &&
    SCRIPT_IMPORT.test(next)
  );
}

/**
 * @param {FileChange} change
 * @returns {Finding[]} The added suppression comments and skipped tests.
 */
function addedFindings(change) {
  const isTest = TEST_FILE.test(change.path);
  return change.added.flatMap((line, index) => {
    if (SUPPRESSION.test(line.text)) {
      if (isScriptImportMarker(line.text, change.added[index + 1]?.text)) {
        return [];
      }
      return [
        finding(
          change.path,
          line,
          "suppression",
          "Added a suppression comment",
        ),
      ];
    }
    if (isTest && SKIPPED_TEST.test(line.text)) {
      return [
        finding(
          change.path,
          line,
          "skipped test",
          "Added a skipped or focused test",
        ),
      ];
    }
    return [];
  });
}

/**
 * @param {FileChange} change A changed test file.
 * @returns {Finding[]} The removed test cases with no added one, and, when no case went, a loss of `expect(` calls.
 */
function testLossFindings(change) {
  const removedCases = change.removed.filter((line) =>
    TEST_CASE.test(line.text),
  );
  const addedCases = change.added.filter((line) => TEST_CASE.test(line.text));
  const lostCases = removedCases.slice(
    0,
    Math.max(0, removedCases.length - addedCases.length),
  );
  if (lostCases.length > 0) {
    return lostCases.map((line) =>
      finding(change.path, line, "deleted test case", "Deleted a test case"),
    );
  }
  const lost = countExpects(change.removed) - countExpects(change.added);
  const first = change.removed.find((line) => expectCalls(line.text) > 0);
  if (lost > 0 && first) {
    return [
      finding(
        change.path,
        first,
        "fewer assertions",
        `The file has ${lost} fewer expect() call${lost === 1 ? "" : "s"} than before`,
      ),
    ];
  }
  return [];
}

/**
 * @param {string} text A number as written in the source, with `_` separators.
 * @returns {number}
 */
function numberOf(text) {
  return Number(text.replaceAll("_", ""));
}

/**
 * @param {DiffLine[]} lines
 * @param {RegExp} pattern
 * @returns {Map<string, { line: number, value: number }[]>} The matches of `pattern`, in order, by key.
 */
function barsByKey(lines, pattern) {
  /** @type {Map<string, { line: number, value: number }[]>} */
  const byKey = new Map();
  for (const { line, text } of lines) {
    const match = pattern.exec(text);
    if (match) {
      byKey.set(match[1], [
        ...(byKey.get(match[1]) ?? []),
        { line, value: numberOf(match[2]) },
      ]);
    }
  }
  return byKey;
}

/**
 * @param {FileChange} change A changed file.
 * @returns {Finding[]} The bars of the file that got weaker or were removed, pairing the removed and added values of one key in order.
 */
function barFindings(change) {
  return BARS.filter((bar) => bar.file.test(change.path)).flatMap((bar) => {
    const before = barsByKey(change.removed, bar.line);
    const after = barsByKey(change.added, bar.line);
    return [...before].flatMap(([key, olds]) =>
      olds.flatMap((old, index) => {
        const now = after.get(key)?.[index];
        const at = { line: now?.line ?? old.line, text: "" };
        if (!now) {
          return [
            finding(
              change.path,
              at,
              "lowered bar",
              `The ${bar.what} ${key} (${old.value}) was removed`,
            ),
          ];
        }
        const weaker =
          bar.direction === "floor"
            ? now.value < old.value
            : now.value > old.value;
        return weaker
          ? [
              finding(
                change.path,
                at,
                "lowered bar",
                `The ${bar.what} ${key} went from ${old.value} to ${now.value}`,
              ),
            ]
          : [];
      }),
    );
  });
}

/**
 * @param {FileChange} change
 * @returns {Finding[]}
 */
function changeFindings(change) {
  if (change.deleted) {
    return TEST_FILE.test(change.path)
      ? [
          finding(
            change.path,
            { line: 1, text: "" },
            "deleted test file",
            "Deleted a test file",
          ),
        ]
      : [];
  }
  return [
    ...(CODE_FILE.test(change.path) ? addedFindings(change) : []),
    ...(TEST_FILE.test(change.path) ? testLossFindings(change) : []),
    ...barFindings(change),
  ];
}

/**
 * The ways a diff lowers the quality bar.
 *
 * @param {string} diff A zero-context unified diff (`git diff -U0`).
 * @returns {Finding[]}
 */
export function findQualityBarChanges(diff) {
  return parseDiff(diff).flatMap(changeFindings);
}

/**
 * @param {string} text
 * @returns {string} The text with the characters that are special in a pattern escaped.
 */
function escapePattern(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether the pull request description acknowledges a finding: it has the
 * words "quality bar", or it names the file. A file name only counts as a whole
 * word, so `a.ts` is not found in `data.ts`.
 *
 * @param {{ file: string }} found
 * @param {string} body The pull request description.
 * @returns {boolean}
 */
export function isAcknowledged(found, body) {
  if (/quality bar/i.test(body)) {
    return true;
  }
  const name = found.file.split("/").pop() ?? found.file;
  return new RegExp(`(?<![\\w.-])${escapePattern(name)}(?![\\w-])`).test(body);
}

/**
 * Escapes a workflow-command property, where `:` and `,` also end the value.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeProperty(text) {
  return escapeAnnotation(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/**
 * @param {Finding} found
 * @param {boolean} acknowledged
 * @returns {string} The annotation for a finding.
 */
function annotation(found, acknowledged) {
  const level = acknowledged ? "notice" : SEVERITY;
  const message = acknowledged
    ? `${found.message} (acknowledged in the pull request description).`
    : `${found.message}; ${ASK}.`;
  return `::${level} file=${escapeProperty(found.file)},line=${found.line},title=Quality bar::${escapeAnnotation(message)}`;
}

/**
 * Checks a pull request's diff and reports the result.
 *
 * @param {object} input
 * @param {string} input.author The login that opened the pull request.
 * @param {string[]} input.labels The pull request's label names.
 * @param {string} input.title The pull request title.
 * @param {string} input.body The pull request description.
 * @param {string} input.diff The zero-context diff from the base branch to `HEAD`.
 * @param {(line: string) => void} input.log Receives the annotations.
 * @param {(text: string) => void} input.summarise Receives the job summary text.
 * @returns {number} The exit code, always 0: this check only warns.
 */
export function runQualityBarCheck({
  author,
  labels,
  title,
  body,
  diff,
  log,
  summarise,
}) {
  if (skipReason({ author, labels, title }) !== null) {
    return 0;
  }
  const found = findQualityBarChanges(diff);
  if (found.length === 0) {
    return 0;
  }
  const lines = found.map((item) => {
    const acknowledged = isAcknowledged(item, body);
    log(annotation(item, acknowledged));
    return `- ${item.file}:${item.line}: ${item.message}${acknowledged ? " (acknowledged)" : `; ${ASK}`}.`;
  });
  summarise(`### Quality bar\n\n${lines.join("\n")}\n`);
  return 0;
}

/**
 * The diff from the base branch to `HEAD`, read from git without context lines
 * and without the lockfile, whose size says nothing here.
 *
 * @param {string} baseRef The base branch name; its remote-tracking ref `origin/<name>` is read.
 * @param {string} [root] The repository folder.
 * @returns {string | null} Null when the base branch or its history cannot be found.
 */
export function readDiff(baseRef, root = ".") {
  const result = git(
    [
      "-c",
      "core.quotePath=false",
      "diff",
      "-U0",
      "--no-color",
      "--no-ext-diff",
      `origin/${baseRef}...HEAD`,
      "--",
      ".",
      ":(exclude)package-lock.json",
    ],
    root,
  );
  return result.ok ? result.stdout : null;
}

/**
 * Runs the check from the environment. A fault in reading the diff is a
 * skipped check with a warning, never a failed job.
 *
 * @param {Record<string, string | undefined>} env
 * @param {(line: string) => void} log
 * @param {(text: string) => void} summarise
 * @param {(baseRef: string) => string | null} [read] Reads the pull request diff.
 * @returns {number}
 */
export function runFromEnvironment(env, log, summarise, read = readDiff) {
  try {
    const diff = read(env.BASE_REF ?? "main");
    if (diff === null) {
      log(
        "::warning title=Quality bar check skipped::The base branch or its history could not be read.",
      );
      return 0;
    }
    return runQualityBarCheck({
      author: env.PR_AUTHOR ?? "",
      labels: (env.PR_LABELS ?? "").split(",").filter(Boolean),
      title: env.PR_TITLE ?? "",
      body: env.PR_BODY ?? "",
      diff,
      log,
      summarise,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      `::warning title=Quality bar check skipped::${escapeAnnotation(message)}`,
    );
    return 0;
  }
}

/**
 * Runs the check from the command-line environment.
 *
 * @param {Record<string, string | undefined>} env
 * @param {typeof runFromEnvironment} [run] Runs the check.
 * @param {(line: string) => void} [log] Receives annotations.
 * @param {typeof appendFileSync} [append] Appends the job summary.
 * @returns {number} The exit code.
 */
export function main(
  env,
  run = runFromEnvironment,
  log = console.log,
  append = appendFileSync,
) {
  const summaryFile = env.GITHUB_STEP_SUMMARY;
  return run(env, log, (text) => {
    if (summaryFile !== undefined) {
      append(summaryFile, text);
    }
  });
}

if (isEntryPoint(import.meta.url)) {
  process.exit(main(process.env));
}
