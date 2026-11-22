// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LoadContext, Plugin } from "@docusaurus/types";
import {
  API_FILE,
  apiJson,
  CATALOGUE_FILE_NAME,
  type CatalogueData,
  headingsOf,
  PAGES_FILE,
  type PageHeading,
  pagesJson,
} from "../scripts/machineData";
import type { CopyContext, DocPage } from "../scripts/markdownCopies";
import { SDK_VERSION } from "../scripts/sdkVersion";
import { readDocPages } from "./markdownCopiesPlugin";

/**
 * Reads what the API generator left for the build.
 * @param file - The catalogue file.
 */
export function readCatalogueData(file: string): CatalogueData {
  if (!existsSync(file)) {
    throw new Error(
      `${file} is missing. Run "npm run generate -w @mapcairn/docs" to write the API reference.`,
    );
  }
  const data = JSON.parse(readFileSync(file, "utf8")) as Partial<CatalogueData>;
  if (!Array.isArray(data.packages) || !Array.isArray(data.entries)) {
    throw new Error(
      `${file} is not a catalogue: it needs packages and entries.`,
    );
  }
  return data as CatalogueData;
}

/**
 * Writes `pages.json` and `api.json` into a finished build. Both are static
 * files made from the sources the build already holds: the page manifest from
 * the sidebar's pages and their built headings, the API catalogue from the
 * model the API pages are written from.
 * @param outDir - The build folder.
 * @param pages - Every page, in sidebar order.
 * @param catalogue - The API generator's data.
 * @param context - The site's origin, base path and version.
 */
export function writeMachineData(
  outDir: string,
  pages: readonly DocPage[],
  catalogue: CatalogueData,
  context: CopyContext,
): void {
  const headings = new Map<string, PageHeading[]>(
    pages.map((page) => [
      page.permalink,
      headingsOf(
        readFileSync(
          join(outDir, page.permalink.slice(1), "index.html"),
          "utf8",
        ),
      ),
    ]),
  );
  writeFileSync(
    join(outDir, PAGES_FILE),
    JSON.stringify(pagesJson(pages, headings, catalogue.packages, context)),
  );
  writeFileSync(
    join(outDir, API_FILE),
    JSON.stringify(apiJson(catalogue.entries, catalogue.packages, context)),
  );
}

/** The Docusaurus plugin that runs {@link writeMachineData} after the build. */
export default function machineDataPlugin({
  siteDir,
  siteConfig,
}: LoadContext): Plugin {
  return {
    name: "mapcairn-machine-data",
    postBuild({ outDir }) {
      writeMachineData(
        outDir,
        readDocPages(join(siteDir, "docs")),
        readCatalogueData(join(siteDir, "docs", "api", CATALOGUE_FILE_NAME)),
        {
          origin: siteConfig.url,
          baseUrl: siteConfig.baseUrl,
          version: SDK_VERSION,
          title: siteConfig.title,
          tagline: siteConfig.tagline,
        },
      );
    },
  };
}
