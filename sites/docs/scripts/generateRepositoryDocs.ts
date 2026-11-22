// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPOSITORY_DOCS, renderRepositoryDoc } from "./repositoryDocs";

/**
 * Writes a page for each repository document into a folder, replacing what
 * the folder held, so a document removed from the list leaves no stale page.
 * @param repositoryRoot - The repository root the documents are read from.
 * @param outputDir - The folder the pages are written to.
 * @returns The paths written.
 */
export function writeRepositoryDocs(
  repositoryRoot: string,
  outputDir: string,
): string[] {
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  return REPOSITORY_DOCS.map((doc) => {
    const page = renderRepositoryDoc(
      readFileSync(join(repositoryRoot, doc.source), "utf8"),
      doc,
    );
    const path = join(outputDir, doc.output);
    writeFileSync(path, page);
    return path;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeRepositoryDocs(
    fileURLToPath(new URL("../../..", import.meta.url)),
    fileURLToPath(new URL("../docs/generated", import.meta.url)),
  );
}
