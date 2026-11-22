// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPOSITORY_URL } from "../src/siteConfig";
import { buildCatalogue, requireDescriptions } from "./api/catalogue";
import { loadPackage } from "./api/loadPackages";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Where the generated pages go. It is git-ignored and rebuilt by `npm run generate`. */
export const API_OUTPUT = fileURLToPath(
  new URL("../docs/api/", import.meta.url),
);

/** The sidebar the generator writes, read by `sidebars.ts`. The leading underscore keeps it out of the pages. */
export const SIDEBAR_FILE = join(API_OUTPUT, "_sidebar.json");

/**
 * Writes the API reference pages and their sidebar. It stops, listing them,
 * when an export has no description.
 */
export async function generateApi(): Promise<void> {
  const { SDK_PACKAGES } = await import("../../../scripts/sdkPackages.mjs");
  const packages = [];
  for (const dirName of SDK_PACKAGES) {
    packages.push(await loadPackage(REPOSITORY_ROOT, dirName));
  }
  const catalogue = buildCatalogue(packages, REPOSITORY_URL);
  requireDescriptions(catalogue);
  rmSync(API_OUTPUT, { recursive: true, force: true });
  for (const [path, text] of catalogue.files) {
    const target = join(API_OUTPUT, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  writeFileSync(
    SIDEBAR_FILE,
    `${JSON.stringify(catalogue.sidebar, null, 2)}\n`,
  );
  console.log(
    `API reference: ${catalogue.files.size} pages from ${packages.length} packages.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateApi().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
