// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRepositoryPages, REPOSITORY_DOCS } from "./repositoryDocs";

/** The sidebar entries the generator writes, read by `sidebars.ts`. The leading underscore keeps the file out of the pages. */
export const REPOSITORY_SIDEBAR_FILE = "_sidebar.json";

/**
 * Writes the pages of each repository document into a folder, replacing what
 * the folder held, so a document removed from the list leaves no stale page,
 * and the sidebar entries that list them.
 * @param repositoryRoot - The repository root the documents are read from.
 * @param outputDir - The folder the pages are written to.
 * @returns The paths written.
 */
export function writeRepositoryDocs(
  repositoryRoot: string,
  outputDir: string,
): string[] {
  const sources = new Map(
    REPOSITORY_DOCS.map((doc) => [
      doc.source,
      readFileSync(join(repositoryRoot, doc.source), "utf8"),
    ]),
  );
  const { files, sidebar } = buildRepositoryPages(sources);
  rmSync(outputDir, { recursive: true, force: true });
  const written: string[] = [];
  const write = (name: string, text: string): void => {
    const path = join(outputDir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    written.push(path);
  };
  for (const [name, text] of files) {
    write(name, text);
  }
  write(REPOSITORY_SIDEBAR_FILE, `${JSON.stringify(sidebar, null, 2)}\n`);
  return written;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const written = writeRepositoryDocs(
    fileURLToPath(new URL("../../..", import.meta.url)),
    fileURLToPath(new URL("../docs/generated", import.meta.url)),
  );
  console.log(`Repository documents: ${written.length - 1} pages.`);
}
