// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChangelog } from "./changelogPages";

/** The changelog of the repository, which the pages are built from. */
const CHANGELOG_FILE = fileURLToPath(
  new URL("../../../CHANGELOG.md", import.meta.url),
);

/** Where the pages go. It is git-ignored: `CHANGELOG.md` is the source. */
export const CHANGELOG_OUTPUT = fileURLToPath(
  new URL("../docs/changelog/", import.meta.url),
);

/** The sidebar entry the generator writes, read by `sidebars.ts`. The leading underscore keeps it out of the pages. */
export const CHANGELOG_SIDEBAR_FILE = join(CHANGELOG_OUTPUT, "_sidebar.json");

/** Writes a page for each release in `CHANGELOG.md`, an index and the sidebar entry. */
export function generateChangelog(): void {
  const changelog = buildChangelog(readFileSync(CHANGELOG_FILE, "utf8"));
  rmSync(CHANGELOG_OUTPUT, { recursive: true, force: true });
  mkdirSync(CHANGELOG_OUTPUT, { recursive: true });
  for (const [name, text] of changelog.files) {
    writeFileSync(join(CHANGELOG_OUTPUT, name), text);
  }
  writeFileSync(
    CHANGELOG_SIDEBAR_FILE,
    `${JSON.stringify(changelog.sidebar, null, 2)}\n`,
  );
  console.log(`Changelog: ${changelog.files.size - 1} releases.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    generateChangelog();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
