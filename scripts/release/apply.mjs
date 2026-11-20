// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Applies a release to the working tree: sets the version of the four SDK
 * packages and every internal range that names them, puts the notes at the top
 * of `CHANGELOG.md` under `## <version> (<date>)`, and runs a real
 * `npm install --ignore-scripts` so the lockfile matches. It commits, tags and
 * publishes nothing.
 *
 *   npm run release:apply -- <version> <notes-file> [--dry-run] [--date YYYY-MM-DD]
 *
 * The notes file holds the notes only: the script adds the version heading.
 * It refuses to run on a tree with uncommitted changes, on a version that is
 * not newer than the current one, and on notes that fail the notes check.
 * `--dry-run` lists what would change and writes nothing.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { extractNotes, insertSection, scanLines } from "./changelog.mjs";
import {
  checkChangelog,
  isShallowClone,
  subjectsSincePreviousTag,
} from "./notesCheck.mjs";
import { compareVersions, parseVersion } from "./semver.mjs";
import { git, npm } from "./tools.mjs";
import {
  readSdkState,
  readWorkspaceManifests,
  setReleaseInManifest,
} from "./workspaces.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const LOCKFILE = "package-lock.json";
const CHANGELOG = "CHANGELOG.md";

/** A refusal, with a message for the person who ran the script. */
export class ReleaseError extends Error {}

/**
 * What the script does outside the files it reads: git, npm and the clock.
 *
 * @typedef {object} ApplyTools
 * @property {(root: string) => string | null} dirtyFiles A summary of uncommitted changes, an empty string for a clean tree, null when git cannot say.
 * @property {(root: string) => { ok: boolean, stderr: string }} install Runs `npm install --ignore-scripts`.
 * @property {() => string} today `YYYY-MM-DD`.
 * @property {(root: string) => ((version: string) => string[] | null) | undefined} [subjectsFor] The commit subjects between the tag before a version and that version, for the notes check; undefined when the history is not complete.
 */

/** @type {ApplyTools} */
export const realTools = {
  dirtyFiles: (root) => {
    const result = git(["status", "--porcelain"], root);
    return result.ok ? result.stdout.trim() : null;
  },
  install: (root) => npm(["install", "--ignore-scripts"], root),
  subjectsFor: (root) =>
    isShallowClone(root) === false ? subjectsSincePreviousTag(root) : undefined,
  today: () => {
    const now = new Date();
    const pad = (/** @type {number} */ number) =>
      String(number).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  },
};

/**
 * @param {string} notes
 * @returns {boolean} Whether the notes start with a heading of their own.
 */
function startsWithVersionHeading(notes) {
  return scanLines(notes).some(
    (line) => !line.fenced && /^##\s/.test(line.text),
  );
}

/**
 * Applies a release.
 *
 * @param {object} input
 * @param {string} input.root The repository folder.
 * @param {string} input.version The new version.
 * @param {string} input.notes The notes, without a version heading.
 * @param {string | null} [input.date] `YYYY-MM-DD`, today by default.
 * @param {boolean} [input.dryRun]
 * @param {ApplyTools} [input.tools]
 * @returns {{ version: string, date: string, files: string[], dryRun: boolean, lockfileDrift?: string[] }} The files written, or that would be, and the lockfile paths that changed beyond the workspaces.
 * @throws {ReleaseError} When the release cannot be applied; nothing is left changed.
 */
export function applyRelease({
  root,
  version,
  notes,
  date = null,
  dryRun = false,
  tools = realTools,
}) {
  const next = parseVersion(version);
  if (next === null) {
    throw new ReleaseError(
      `${version} is not a version: use X.Y.Z or X.Y.Z-rc.N, without a leading v.`,
    );
  }
  if (notes.trim() === "") {
    throw new ReleaseError("The notes file is empty.");
  }
  if (startsWithVersionHeading(notes)) {
    throw new ReleaseError(
      "The notes file must not hold a `##` heading: the script adds the version heading.",
    );
  }
  const state = readSdkState(root);
  if (!state.consistent || state.version === null) {
    throw new ReleaseError(
      "The four SDK packages do not share one version, so there is nothing safe to raise.",
    );
  }
  const current = parseVersion(state.version);
  if (current === null || compareVersions(next, current) <= 0) {
    throw new ReleaseError(
      `${version} is not newer than the current version, ${state.version}.`,
    );
  }
  const dirty = tools.dirtyFiles(root);
  if (dirty === null) {
    throw new ReleaseError(
      "git could not say whether the working tree is clean.",
    );
  }
  if (dirty !== "") {
    throw new ReleaseError(
      "The working tree has uncommitted changes. Commit or restore them first.",
    );
  }
  const changelogPath = path.join(root, CHANGELOG);
  if (!existsSync(changelogPath)) {
    throw new ReleaseError(`${CHANGELOG} does not exist.`);
  }
  const changelog = readFileSync(changelogPath, "utf8");
  if (extractNotes(changelog, version) !== null) {
    throw new ReleaseError(
      `${CHANGELOG} already has a section for ${version}.`,
    );
  }
  const heading = date ?? tools.today();
  const updatedChangelog = insertSection(changelog, version, heading, notes);
  const findings = checkChangelog(updatedChangelog, {
    subjectsFor: tools.subjectsFor?.(root),
  });
  if (findings.length > 0) {
    throw new ReleaseError(
      `The notes fail the notes check:\n${findings
        .map((finding) => `  ${CHANGELOG}:${finding.line}: ${finding.message}`)
        .join("\n")}`,
    );
  }
  const manifests = readWorkspaceManifests(root).flatMap((entry) => {
    const text = setReleaseInManifest(entry.text, version);
    return text === entry.text
      ? []
      : [{ file: entry.file, before: entry.text, text }];
  });
  const files = [...manifests.map((entry) => entry.file), CHANGELOG, LOCKFILE];
  if (dryRun) {
    return { version, date: heading, files, dryRun };
  }
  const lockPath = path.join(root, LOCKFILE);
  const lock = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : null;
  const restore = () => {
    for (const entry of manifests) {
      writeFileSync(path.join(root, entry.file), entry.before);
    }
    writeFileSync(changelogPath, changelog);
    if (lock !== null) {
      writeFileSync(lockPath, lock);
    }
  };
  let installed = null;
  try {
    for (const entry of manifests) {
      writeFileSync(path.join(root, entry.file), entry.text);
    }
    writeFileSync(changelogPath, updatedChangelog);
    installed = tools.install(root);
  } catch (error) {
    restore();
    throw new ReleaseError(
      `${error instanceof Error ? error.message : String(error)}\n${PUT_BACK}`,
    );
  }
  if (!installed.ok) {
    restore();
    throw new ReleaseError(
      `npm install failed:\n${installed.stderr.trim()}\n${PUT_BACK}`,
    );
  }
  const drift =
    lock === null
      ? []
      : lockfileDrift(
          lock,
          readFileSync(lockPath, "utf8"),
          manifests.map((entry) => path.posix.dirname(entry.file)),
        );
  return { version, date: heading, files, dryRun, lockfileDrift: drift };
}

/** What to tell a person after every file has been put back. */
const PUT_BACK =
  "Every file was put back as it was. Run `npm ci --ignore-scripts` so node_modules matches the lockfile again.";

/**
 * The lockfile paths that changed beyond the workspaces' own entries and the
 * links to them: the drift an install brings in besides the new versions, such
 * as a dependency that moved within its range. A person reads it before
 * committing.
 *
 * @param {string} before The lockfile before the install.
 * @param {string} after The lockfile after.
 * @param {string[]} workspaceFolders The folders of the workspaces whose manifest changed.
 * @returns {string[]} Sorted; `lockfileVersion` when that changed.
 */
export function lockfileDrift(before, after, workspaceFolders) {
  let old;
  let current;
  try {
    old = JSON.parse(before);
    current = JSON.parse(after);
  } catch {
    return [];
  }
  const oldPackages = old.packages ?? {};
  const newPackages = current.packages ?? {};
  const changed = [
    ...new Set([...Object.keys(oldPackages), ...Object.keys(newPackages)]),
  ].filter(
    (key) =>
      JSON.stringify(oldPackages[key]) !== JSON.stringify(newPackages[key]) &&
      !workspaceFolders.includes(key) &&
      !key.startsWith("node_modules/@mapcairn/"),
  );
  if (old.lockfileVersion !== current.lockfileVersion) {
    changed.push("lockfileVersion");
  }
  return changed.sort();
}

/**
 * @param {string[]} argv
 * @returns {{ version: string, notesFile: string, dryRun: boolean, date: string | null } | { error: string }}
 */
export function parseArguments(argv) {
  const positional = [];
  let dryRun = false;
  let date = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--date") {
      date = argv[index + 1] ?? null;
      index += 1;
      if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { error: "--date takes a date as YYYY-MM-DD." };
      }
    } else if (argument.startsWith("--")) {
      return { error: `Unknown option ${argument}.` };
    } else {
      positional.push(argument);
    }
  }
  if (positional.length !== 2) {
    return {
      error:
        "Usage: release:apply -- <version> <notes-file> [--dry-run] [--date YYYY-MM-DD]",
    };
  }
  return { version: positional[0], notesFile: positional[1], dryRun, date };
}

if (isEntryPoint(import.meta.url)) {
  const parsed = parseArguments(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(2);
  }
  // An interrupt reaches npm as well as this script. Keeping this script alive
  // lets it see npm stop and put the files back.
  process.on("SIGINT", () => {});
  try {
    const notes = readFileSync(path.resolve(parsed.notesFile), "utf8");
    const result = applyRelease({
      root: ROOT,
      version: parsed.version,
      notes,
      date: parsed.date,
      dryRun: parsed.dryRun,
    });
    console.log(
      `${result.dryRun ? "Would set" : "Set"} the SDK packages to ${result.version} (${result.date}) and write:`,
    );
    for (const file of result.files) {
      console.log(`  ${file}`);
    }
    if (result.dryRun) {
      console.log("Dry run: nothing was written.");
    }
    if (result.lockfileDrift?.length) {
      console.log(
        `The lockfile also changed outside the workspaces. Read these before you commit:\n  ${result.lockfileDrift.join("\n  ")}`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
