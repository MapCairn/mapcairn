// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Fails when a script, skill, agent, instruction file or guide holds text that
 * works on one operating system only: an absolute home or drive path, or a
 * command that differs between macOS, Linux and Windows. Use a Node script run
 * through `npm run` (see `scripts/agents/port.mjs`) or a relative path instead.
 *
 *   node scripts/portability-check.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The one file that has to spell out the patterns it looks for. */
const SELF = "scripts/portability-check.mjs";
/** Folders whose tracked files are checked. */
const CHECKED_FOLDERS = ["scripts/", ".claude/", "docs/guides/"];
/** Tracked files, outside those folders, that are checked. */
const CHECKED_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "lefthook.yml",
]);
const TEXT_FILE = /\.(?:md|mjs|cjs|yml|yaml|json)$/;

/** A pattern and what is wrong with it. */
const RULES = [
  { pattern: /\/Users\/\w/, message: "a macOS home path" },
  { pattern: /\/home\/\w/, message: "a Linux home path" },
  { pattern: /\b[A-Za-z]:\\\w/, message: "a Windows drive path" },
  { pattern: /(?:^|[\s`"'(])\/tmp\//, message: "a path in /tmp" },
  { pattern: /\blsof\b/, message: "lsof (use scripts/agents/port.mjs)" },
  { pattern: /\bpgrep\b/, message: "pgrep" },
  { pattern: /\bpkill\b/, message: "pkill" },
  { pattern: /\breadlink -f\b/, message: "readlink -f (GNU only)" },
  { pattern: /\bdate -d\b/, message: "date -d (GNU only)" },
  { pattern: /\bsed -i\b/, message: "sed -i (differs between BSD and GNU)" },
  { pattern: /\bmktemp\b/, message: "mktemp (flags differ by system)" },
  { pattern: /\bpython3\b/, message: "python3 (not a command on Windows)" },
];

/**
 * Whether the tracked file is one the check reads.
 *
 * @param {string} path Repository-relative path with forward slashes.
 * @returns {boolean}
 */
export function isChecked(path) {
  if (path === SELF || !TEXT_FILE.test(path)) {
    return false;
  }
  return (
    CHECKED_FILES.has(path) ||
    CHECKED_FOLDERS.some((folder) => path.startsWith(folder))
  );
}

/**
 * The non-portable text in a file, one entry for each line that holds any.
 *
 * @param {string} text
 * @returns {{ line: number, message: string }[]}
 */
export function findProblems(text) {
  const problems = [];
  text.split(/\r?\n/).forEach((content, index) => {
    const rule = RULES.find(({ pattern }) => pattern.test(content));
    if (rule !== undefined) {
      problems.push({ line: index + 1, message: rule.message });
    }
  });
  return problems;
}

/** Reports every problem in the tracked files and exits 1 if there is one. */
function main() {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(isChecked);
  const reports = tracked.flatMap((path) =>
    findProblems(readFileSync(path, "utf8")).map(
      ({ line, message }) => `${path}:${line}: ${message}`,
    ),
  );
  if (reports.length > 0) {
    console.error(
      `portability: ${reports.length} problem(s)\n${reports.join("\n")}`,
    );
    process.exit(1);
  }
  console.log(
    `portability: ${tracked.length} files checked, none non-portable`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
