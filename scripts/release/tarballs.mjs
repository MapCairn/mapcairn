// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Packs the four SDK packages once, and records the SHA-256 of each tarball.
 * The release workflow packs here, checks those very files (`packCheck.mjs
 * --tarballs`, `consumerCheck.mjs --tarballs`), and re-checks the digests
 * with `sha256sum --check` before it uploads, attests and stages them, so the
 * bytes that were checked are the bytes that are released.
 *
 *   node scripts/release/tarballs.mjs pack <folder>   packs and writes SHA256SUMS
 *   node scripts/release/tarballs.mjs sums <folder>   writes SHA256SUMS for tarballs already there
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { runNpm } from "./npm.mjs";
import { findTarballs, PACKAGES } from "./packCheck.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** The file the digests are written to, in the format `sha256sum --check` reads. */
export const SUMS_FILE = "SHA256SUMS";

/** A file name a digest line can hold without being read as an option or a path. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._@+-]*$/;

/**
 * @param {string} file
 * @returns {string} The SHA-256 of the file's bytes, in lower-case hex.
 */
export function sha256Of(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/**
 * The text of a digest file: one `<digest>  <name>` line for each file,
 * sorted by name.
 *
 * @param {Array<{ name: string, digest: string }>} entries
 * @returns {string}
 * @throws {Error} For a name that is not a plain file name.
 */
export function formatSums(entries) {
  return [...entries]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map(({ name, digest }) => {
      if (!SAFE_NAME.test(name)) {
        throw new Error(
          `The file name ${JSON.stringify(name)} is not allowed.`,
        );
      }
      return `${digest}  ${name}\n`;
    })
    .join("");
}

/**
 * Writes `SHA256SUMS` for the four tarballs in a folder.
 *
 * @param {string} folder
 */
function writeSums(folder) {
  const tarballs = findTarballs(readdirSync(folder));
  const entries = PACKAGES.map((name) => ({
    name: tarballs[name],
    digest: sha256Of(path.join(folder, tarballs[name])),
  }));
  writeFileSync(path.join(folder, SUMS_FILE), formatSums(entries));
  console.log(formatSums(entries).trimEnd());
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
  writeSums(folder);
}

if (isEntryPoint(import.meta.url)) {
  const [command, folder] = process.argv.slice(2);
  try {
    if (command === "pack" && folder !== undefined) {
      packAll(path.resolve(folder));
    } else if (command === "sums" && folder !== undefined) {
      writeSums(path.resolve(folder));
    } else {
      console.error(
        "Usage: node scripts/release/tarballs.mjs pack|sums <folder>",
      );
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
