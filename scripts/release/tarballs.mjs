// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Packs the four SDK packages once, records the SHA-256 of each tarball (and
 * of the release notes) as a job output, and checks a folder against those
 * recorded digests later. The release workflow packs in `verify`, uploads at
 * once, and passes the digests to the later jobs as a job output, which a
 * step that runs third-party code cannot change. `github-release` and `npm`
 * compare what they download with those digests before they attest or stage,
 * so what was checked is what is released, and an extra tarball cannot ride
 * along.
 *
 *   node scripts/release/tarballs.mjs pack <folder>
 *   node scripts/release/tarballs.mjs record <folder>
 *   node scripts/release/tarballs.mjs check <folder> <digests> [<notes-digest>]
 *   node scripts/release/tarballs.mjs check-release <folder> <digests> <notes-digest>
 *
 * `record` writes the job outputs `digests` and `notes-digest` (the latter
 * empty when the folder has no `notes.md`).
 */
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { runNpm } from "./npm.mjs";
import { findTarballs, PACKAGES } from "./packCheck.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** The file name of the release notes next to the tarballs. */
const NOTES_FILE = "notes.md";

/** A file name a digest entry can hold without being read as an option or a path. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._@+-]*$/;

/** A SHA-256 in lower-case hex. */
const DIGEST = /^[0-9a-f]{64}$/;

/**
 * @param {string} file
 * @returns {string} The SHA-256 of the file's bytes, in lower-case hex.
 */
export function sha256Of(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/**
 * The digests as one line, `<digest>:<name>` entries separated by commas and
 * sorted by name, which fits a job output.
 *
 * @param {Array<{ name: string, digest: string }>} entries
 * @returns {string}
 * @throws {Error} For a name that is not a plain file name or a digest that is not SHA-256 hex.
 */
export function formatDigests(entries) {
  return [...entries]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map(({ name, digest }) => {
      if (!SAFE_NAME.test(name)) {
        throw new Error(
          `The file name ${JSON.stringify(name)} is not allowed.`,
        );
      }
      if (!DIGEST.test(digest)) {
        throw new Error(`The digest of ${name} is not a SHA-256.`);
      }
      return `${digest}:${name}`;
    })
    .join(",");
}

/**
 * Reads what `formatDigests` wrote.
 *
 * @param {string} text
 * @returns {Array<{ name: string, digest: string }>}
 * @throws {Error} For text that is not a list of digests.
 */
export function parseDigests(text) {
  if (text === "") {
    throw new Error("The list of digests is empty.");
  }
  return text.split(",").map((entry) => {
    const [digest, name, ...rest] = entry.split(":");
    if (
      rest.length > 0 ||
      !DIGEST.test(digest ?? "") ||
      !SAFE_NAME.test(name ?? "")
    ) {
      throw new Error(`${JSON.stringify(entry)} is not a digest and a name.`);
    }
    return { name, digest };
  });
}

/**
 * What differs between the digests recorded at the start and the files found
 * later: a changed file, a missing one, and one that was never packed.
 *
 * @param {Array<{ name: string, digest: string }>} expected
 * @param {Array<{ name: string, digest: string }>} actual
 * @returns {string[]}
 */
export function digestProblems(expected, actual) {
  /** @type {string[]} */
  const problems = [];
  const found = new Map(actual.map((entry) => [entry.name, entry.digest]));
  for (const { name, digest } of expected) {
    if (!found.has(name)) {
      problems.push(`${name} is missing`);
    } else if (found.get(name) !== digest) {
      problems.push(
        `${name} has a different digest from the one recorded when it was packed`,
      );
    }
  }
  const known = new Set(expected.map((entry) => entry.name));
  for (const { name } of actual) {
    if (!known.has(name)) {
      problems.push(
        `${name} was not packed by the release and must not be released`,
      );
    }
  }
  return problems.sort();
}

/**
 * Checks a folder against the recorded digests: every tarball in it must be
 * one that was recorded, unchanged, and the notes must match when a digest
 * for them is given.
 *
 * @param {string} folder
 * @param {string} digests What `formatDigests` wrote.
 * @param {string} notesDigest The notes digest. An empty string means no notes were recorded, so the folder must hold none.
 * @param {{ requireNotes?: boolean }} [options] `requireNotes` makes an empty notes digest a problem, for the job that creates the Release from the notes.
 * @returns {string[]} The problems, none when the folder is as recorded.
 */
export function checkFolder(
  folder,
  digests,
  notesDigest,
  { requireNotes = false } = {},
) {
  const actual = readdirSync(folder)
    .filter((file) => file.endsWith(".tgz"))
    .map((name) => ({ name, digest: sha256Of(path.join(folder, name)) }));
  const problems = digestProblems(parseDigests(digests), actual);
  const notes = path.join(folder, NOTES_FILE);
  if (notesDigest === "") {
    if (requireNotes) {
      problems.push(
        "no notes digest was recorded, and the release needs its notes",
      );
    } else if (existsSync(notes)) {
      problems.push(`${NOTES_FILE} is present, but no notes were recorded`);
    }
  } else {
    if (!existsSync(notes)) {
      problems.push(`${NOTES_FILE} is missing`);
    } else if (sha256Of(notes) !== notesDigest) {
      problems.push(
        `${NOTES_FILE} has a different digest from the one recorded when it was written`,
      );
    }
  }
  return problems;
}

/**
 * Packs the four packages into a folder, once, without running scripts.
 *
 * @param {string} folder
 */
function packAll(folder) {
  mkdirSync(folder, { recursive: true });
  for (const name of PACKAGES) {
    const result = runNpm(
      ["pack", "--ignore-scripts", "--pack-destination", folder],
      { cwd: path.join(REPO, "packages", name) },
    );
    if (result.status !== 0) {
      throw new Error(`npm pack failed for ${name}:\n${result.stderr}`);
    }
  }
}

/**
 * Records the digests of the four tarballs, and of the notes when there are
 * any, as job outputs (or on the log when run by hand).
 *
 * @param {string} folder
 */
function record(folder) {
  const tarballs = findTarballs(readdirSync(folder));
  const digests = formatDigests(
    PACKAGES.map((name) => ({
      name: tarballs[name],
      digest: sha256Of(path.join(folder, tarballs[name])),
    })),
  );
  const notes = path.join(folder, NOTES_FILE);
  const notesDigest = existsSync(notes) ? sha256Of(notes) : "";
  const lines = `digests=${digests}\nnotes-digest=${notesDigest}\n`;
  if (process.env.GITHUB_OUTPUT === undefined) {
    console.log(lines.trimEnd());
  } else {
    appendFileSync(process.env.GITHUB_OUTPUT, lines);
  }
}

if (isEntryPoint(import.meta.url)) {
  const [command, folder, digests, notesDigest = ""] = process.argv.slice(2);
  try {
    if (command === "pack" && folder !== undefined) {
      packAll(path.resolve(folder));
    } else if (command === "record" && folder !== undefined) {
      record(path.resolve(folder));
    } else if (
      (command === "check" || command === "check-release") &&
      folder !== undefined &&
      digests
    ) {
      const problems = checkFolder(path.resolve(folder), digests, notesDigest, {
        requireNotes: command === "check-release",
      });
      for (const problem of problems) {
        console.error(problem);
      }
      if (problems.length > 0) {
        throw new Error("The files are not the ones that were packed.");
      }
      console.log("The files are the ones that were packed.");
    } else {
      console.error(
        "Usage: node scripts/release/tarballs.mjs pack|record <folder> | check <folder> <digests> [<notes-digest>] | check-release <folder> <digests> <notes-digest>",
      );
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
