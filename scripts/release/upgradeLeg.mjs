// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The pure parts of the consumer check's upgrade leg (`consumerCheck.mjs`):
 * whether it runs, the app as the latest release's tag left it, how a failed
 * type check or build is read, and whether the release notes name what broke.
 * They are kept apart so unit tests can cover them without an install.
 *
 * The leg installs the latest published release into an app that was written
 * for it, then installs the packed tarballs over it in place. If the app no
 * longer type-checks or builds, the notes of the version being released, the
 * text under "What to change when you upgrade", must name what changed. An
 * app that breaks on a name the notes leave out fails the leg.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { UPGRADE_HEADING, upgradeGroups } from "./notesCheck.mjs";
import {
  isNotFound,
  isolatedEnvironment,
  REGISTRY_READ_FLAGS,
} from "./npm.mjs";
import { compareVersions, parseVersion } from "./semver.mjs";
import { git, npm } from "./tools.mjs";

export { UPGRADE_HEADING };

/** Output a step may print before it is cut off, in bytes. */
const MAX_OUTPUT = 64 * 1024 * 1024;

/** The characters of an unmatched failure a message shows. */
const EXCERPT = 300;

/**
 * The lines of a failed type check or build that say what went wrong: a
 * TypeScript error, or the bundler's missing or unresolved name.
 */
const PROBLEM_LINE =
  /error TS\d+:|is not exported by|Could not resolve|Failed to resolve/i;

/** A name between quotes in an error line, as TypeScript and the bundler print it. */
const QUOTED = /['"]([^'"\s]+)['"]/g;

/** What an exported name looks like, which leaves out packages, paths and files. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** The names TypeScript prints for its own types, which no notes would name. */
const TYPE_KEYWORDS = new Set([
  "any",
  "bigint",
  "boolean",
  "false",
  "never",
  "null",
  "number",
  "object",
  "string",
  "symbol",
  "true",
  "undefined",
  "unknown",
  "void",
]);

/**
 * The text under every "What to change when you upgrade" heading of one
 * version's release notes (the text the GitHub Release carries), code blocks
 * included, because a "Before" block names what was removed.
 *
 * @param {string} releaseNotes The notes of one version, without its heading.
 * @returns {string} Empty when the notes ask nothing of an upgrading app.
 */
export function migrationNotes(releaseNotes) {
  return upgradeGroups(releaseNotes)
    .flatMap(([, ...body]) => body.map((line) => line.text))
    .join("\n")
    .trim();
}

/**
 * The lines of output that report an error.
 *
 * @param {string} output
 * @returns {string[]}
 */
function problemLines(output) {
  return output.split(/\r?\n/).filter((line) => PROBLEM_LINE.test(line));
}

/**
 * The exported names one error line mentions.
 *
 * @param {string} line
 * @returns {string[]}
 */
function namesIn(line) {
  return [...line.matchAll(QUOTED)]
    .map((match) => match[1])
    .filter((name) => IDENTIFIER.test(name) && !TYPE_KEYWORDS.has(name));
}

/**
 * The names each error in the output of a failed type check or build mentions:
 * the missing export, the property or the type. A package, a path or a file
 * is no name, and neither is a TypeScript keyword. An error that names
 * nothing gives an empty list, so it is kept.
 *
 * @param {string} output
 * @returns {string[][]} One list for each error line.
 */
export function breakingNames(output) {
  return problemLines(output).map(namesIn);
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/**
 * Whether the notes mention the name as a whole word, so `old` is not found in
 * `oldHelper`.
 *
 * @param {string} notes
 * @param {string} name
 * @returns {boolean}
 */
function mentions(notes, name) {
  return new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`).test(notes);
}

/**
 * Reads the output of a step that failed after the upgrade against the notes
 * of the version being released. An error is covered when the notes name one
 * of the names it mentions.
 *
 * @param {{ output: string, notes: string, version: string }} input
 *   `notes` is `migrationNotes` of the version's release notes.
 * @returns {{ problems: string[], documented: string[] }} What the notes leave
 *   out, a sentence for each, and the names the notes did cover.
 */
export function upgradeProblems({ output, notes, version }) {
  const lines = problemLines(output);
  if (lines.length === 0) {
    return {
      problems: [
        `The step failed after the upgrade with no error line to read against the notes: ${output.trim().slice(0, EXCERPT)}`,
      ],
      documented: [],
    };
  }
  /** @type {string[]} */
  const problems = [];
  /** @type {Set<string>} */
  const documented = new Set();
  for (const line of lines) {
    const covered = namesIn(line).filter((name) => mentions(notes, name));
    for (const name of covered) {
      documented.add(name);
    }
    if (covered.length === 0) {
      problems.push(
        `The upgrade to ${version} needs a change the notes do not mention: ${line.trim().replace(/\.$/, "")}. Name it under "${UPGRADE_HEADING}" in the ${version} section of CHANGELOG.md, with a Before and an After.`,
      );
    }
  }
  return { problems, documented: [...documented] };
}

/**
 * Whether the leg runs, and between which versions. It runs when the packed
 * version is newer than the latest published one, which is a Release pull
 * request; between releases the packed version is the published one and there
 * is nothing to upgrade to. `from` names the version to upgrade from instead.
 *
 * @param {{ packed: string, latest: string | null, from: string | null }} input
 * @returns {{ action: "run", from: string, to: string } | { action: "skip", line: string }}
 */
export function upgradePlan({ packed, latest, from }) {
  const parsedPacked = parseVersion(packed);
  if (parsedPacked === null) {
    throw new Error(`The packed version "${packed}" is not a version.`);
  }
  if (from !== null) {
    if (parseVersion(from) === null) {
      throw new Error(`"${from}" is not a version to upgrade from.`);
    }
    return { action: "run", from, to: packed };
  }
  const parsedLatest = latest === null ? null : parseVersion(latest);
  if (latest === null || parsedLatest === null) {
    return {
      action: "skip",
      line: "upgrade leg skipped: there is no published release to upgrade from",
    };
  }
  if (compareVersions(parsedPacked, parsedLatest) <= 0) {
    return {
      action: "skip",
      line: `upgrade leg skipped: the packed version ${packed} is not newer than the latest release ${latest}, so there is nothing to upgrade to (a Release pull request runs it)`,
    };
  }
  return { action: "run", from: latest, to: packed };
}

/**
 * The version `npm view <package> dist-tags.latest` printed.
 *
 * @param {{ ok: boolean, stdout: string, stderr: string }} result
 * @returns {string | null} Null when the registry has no such package or no `latest` tag.
 */
export function latestFromRegistry(result) {
  if (result.ok) {
    return result.stdout.trim() === "" ? null : result.stdout.trim();
  }
  if (isNotFound(result.stderr)) {
    return null;
  }
  throw new Error(`Could not read the latest release: ${result.stderr}`);
}

/**
 * The latest published version of a package, read from the registry. A read
 * installs nothing, so the minimum release age is lifted for it.
 *
 * @param {string} name The package name.
 * @param {string} cwd Where to run npm.
 * @returns {string | null} Null when the package is not published.
 */
export function latestPublished(name, cwd) {
  return latestFromRegistry(
    npm(["view", name, "dist-tags.latest", ...REGISTRY_READ_FLAGS], cwd),
  );
}

/**
 * The files of a folder as a tag left it, which is the app the upgrade starts
 * from: the page written for the latest release, not the one on this branch,
 * which may use what the release does not have.
 *
 * @param {{ root: string, tag: string, folder: string }} input
 *   `folder` is relative to the repository, with forward slashes.
 * @returns {{ file: string, text: string }[]} Paths relative to the folder.
 */
export function fixtureAtTag({ root, tag, folder }) {
  const listing = git(
    ["ls-tree", "-r", "--name-only", tag, "--", `${folder}/`],
    root,
  );
  const paths = listing.stdout.split(/\r?\n/).filter(Boolean);
  if (!listing.ok || paths.length === 0) {
    throw new Error(
      `${folder} is not in the tag ${tag}. The upgrade leg reads the app as that release left it: run git fetch --tags, then try again.`,
    );
  }
  return paths.map((entry) => {
    const shown = git(["show", `${tag}:${entry}`], root);
    if (!shown.ok) {
      throw new Error(`Could not read ${entry} at ${tag}: ${shown.stderr}`);
    }
    return {
      file: entry
        .slice(folder.length + 1)
        .split("/")
        .join(path.sep),
      text: shown.stdout,
    };
  });
}

/**
 * Runs `node` on a script in a folder, with no shell, and says whether it
 * passed instead of throwing, because a failed step here is read, not fatal.
 *
 * @param {{ args: string[], cwd: string, timeout?: number }} input
 * @returns {{ ok: boolean, output: string }} Its standard output and error together.
 */
export function runStep({ args, cwd, timeout }) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    timeout,
    encoding: "utf8",
    env: isolatedEnvironment(),
    maxBuffer: MAX_OUTPUT,
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
  };
}
