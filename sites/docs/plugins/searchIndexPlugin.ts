// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "@docusaurus/types";
import { htmlFiles } from "../scripts/builtSite";
import { extractRecords, pagePathToUrl } from "../scripts/searchRecords";
import { BASE_URL } from "../src/siteConfig";

/** The file the search box fetches, in the build folder. */
export const SEARCH_INDEX_FILE = "search-index.json";

/** Pages that have an article but are not worth finding. */
const UNSEARCHED_PAGES = new Set(["404.html"]);

/**
 * Writes the search index: the sections of every built page, read back from
 * the finished HTML so every page is covered whatever made it. No third party
 * is involved, and the browser fetches the file from this origin when the
 * search box is first opened.
 * @param outDir - The build folder.
 * @param baseUrl - Where the site is served.
 * @returns How many sections the index holds.
 */
export function writeSearchIndex(outDir: string, baseUrl: string): number {
  const records = htmlFiles(outDir)
    .filter((file) => !UNSEARCHED_PAGES.has(file))
    .flatMap((file) =>
      extractRecords(
        readFileSync(join(outDir, file), "utf8"),
        pagePathToUrl(file, baseUrl),
      ),
    );
  writeFileSync(join(outDir, SEARCH_INDEX_FILE), JSON.stringify(records));
  return records.length;
}

/** The Docusaurus plugin that runs {@link writeSearchIndex} after the build. */
export default function searchIndexPlugin(): Plugin {
  return {
    name: "mapcairn-search-index",
    postBuild({ outDir }) {
      writeSearchIndex(outDir, BASE_URL);
    },
  };
}
