// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Prints the notes of one version from `CHANGELOG.md`, without the version
 * heading. This is the body of the GitHub Release, so the release and the
 * changelog carry the same text.
 *
 *   node scripts/release/notes.mjs <version> [path]
 *
 * Exit codes: 0 printed, 1 the changelog has no section for the version,
 * 2 wrong usage or the file is missing.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { extractNotes } from "./changelog.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

if (isEntryPoint(import.meta.url)) {
  const [version, file = path.join(ROOT, "CHANGELOG.md")] =
    process.argv.slice(2);
  if (version === undefined || !existsSync(file)) {
    console.error("Usage: node scripts/release/notes.mjs <version> [path]");
    process.exit(2);
  }
  const notes = extractNotes(readFileSync(file, "utf8"), version);
  if (notes === null) {
    console.error(`${file} has no section for ${version}.`);
    process.exit(1);
  }
  console.log(notes);
}
