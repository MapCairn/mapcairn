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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntryPoint } from "./entryPoint.mjs";

/** The one file that has to spell out the patterns it looks for. */
const SELF = "scripts/portability-check.mjs";
/** Folders whose tracked files are checked. */
const CHECKED_FOLDERS = [
  "scripts/",
  ".claude/",
  "docs/guides/",
  "sites/docs/docs/",
];
/** Tracked files, outside those folders, that are checked. */
const CHECKED_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "lefthook.yml",
  "package.json",
]);
const TEXT_FILE = /\.(?:md|mjs|cjs|yml|yaml|json)$/;
/** Shell and Python scripts under `scripts/` run on one system only; use Node. */
const SYSTEM_SPECIFIC_SCRIPT = /^scripts\/.*\.(?:sh|ps1|cmd|bat|py)$/;
/** Web addresses are removed from a line before it is read, so a URL segment such as `/home/` is not a path. */
const URL_TEXT = /\bhttps?:\/\/\S+/g;

/** A pattern and what is wrong with it. */
const RULES = [
  { pattern: /\/Users\/\w/, message: "a macOS home path" },
  { pattern: /\/home\/\w/, message: "a Linux home path" },
  { pattern: /(?<!\w)[A-Za-z]:[\\/]+\w/, message: "a Windows drive path" },
  { pattern: /(?:^|[\s`"'(=])\/tmp\b/, message: "a path in /tmp" },
  { pattern: /\blsof\b/, message: "lsof (use scripts/agents/port.mjs)" },
  { pattern: /\bpgrep\b/, message: "pgrep" },
  { pattern: /\bpkill\b/, message: "pkill" },
  { pattern: /\breadlink -f\b/, message: "readlink -f (GNU only)" },
  { pattern: /\bdate\s+-d\b/, message: "date -d (GNU only)" },
  { pattern: /\bsed\s+-i\b/, message: "sed -i (differs between BSD and GNU)" },
  { pattern: /\bmktemp\b/, message: "mktemp (flags differ by system)" },
  { pattern: /\bpython3\b/, message: "python3 (not a command on Windows)" },
  {
    pattern: /--jq\s+'/,
    message:
      "a single-quoted --jq program (cmd does not treat ' as a quote; use double quotes)",
  },
  { pattern: /\/dev\/null/, message: "/dev/null (not on Windows)" },
  { pattern: /\$\(/, message: "a command substitution (bash and zsh only)" },
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
 * Whether the tracked file is a shell, PowerShell, batch or Python script
 * under `scripts/`.
 *
 * @param {string} path Repository-relative path with forward slashes.
 * @returns {boolean}
 */
export function isSystemSpecificScript(path) {
  return SYSTEM_SPECIFIC_SCRIPT.test(path);
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
    const visible = content.replace(URL_TEXT, "");
    const rule = RULES.find(({ pattern }) => pattern.test(visible));
    if (rule !== undefined) {
      problems.push({ line: index + 1, message: rule.message });
    }
  });
  return problems;
}

/** Reports every problem in the tracked files and exits 1 if there is one. */
function main() {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((file) => file !== "" && existsSync(join(root, file)));
  const tracked = files.filter(isChecked);
  const scripts = files
    .filter(isSystemSpecificScript)
    .map((path) => `${path}: use a Node script (.mjs)`);
  const reports = [...scripts, ...checkedReports(root, tracked)];
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

/** One report line for each problem in the files. */
function checkedReports(root, tracked) {
  return tracked.flatMap((file) =>
    findProblems(readFileSync(join(root, file), "utf8")).map(
      ({ line, message }) => `${file}:${line}: ${message}`,
    ),
  );
}

if (isEntryPoint(import.meta.url)) {
  main();
}
