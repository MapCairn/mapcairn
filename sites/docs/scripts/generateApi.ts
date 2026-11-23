// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPOSITORY_URL } from "../src/siteConfig";
import {
  buildCatalogue,
  requireDescriptions,
  requireMemberDescriptions,
} from "./api/catalogue";
import { loadPackage } from "./api/loadPackages";
import { CATALOGUE_FILE_NAME, type CatalogueData } from "./machineData";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * The packages whose every member must have a description, or the build
 * fails. A package joins the list in the pull request that describes its last
 * member (#701); the aim is all six.
 */
export const MEMBER_DESCRIPTION_PACKAGES: readonly string[] = [
  "@mapcairn/adapter-maplibre",
  "@mapcairn/map",
  "@mapcairn/react",
  "@mapcairn/sdk",
  "@mapcairn/theme",
];

/** Where the generated pages go. It is git-ignored and rebuilt by `npm run generate`. */
export const API_OUTPUT = fileURLToPath(
  new URL("../docs/api/", import.meta.url),
);

/** The sidebar the generator writes, read by `sidebars.ts`. The leading underscore keeps it out of the pages. */
export const SIDEBAR_FILE = join(API_OUTPUT, "_sidebar.json");

/**
 * Writes the API reference pages, their sidebar and the catalogue data the
 * build turns into `api.json`. It stops, listing them,
 * when an export has no description, or a member in a package the gate covers.
 */
export async function generateApi(): Promise<void> {
  const { SDK_PACKAGES } = await import("../../../scripts/sdkPackages.mjs");
  const packages = [];
  for (const dirName of SDK_PACKAGES) {
    packages.push(await loadPackage(REPOSITORY_ROOT, dirName));
  }
  const catalogue = buildCatalogue(packages, REPOSITORY_URL);
  requireDescriptions(catalogue);
  requireMemberDescriptions(catalogue, MEMBER_DESCRIPTION_PACKAGES);
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
  const data: CatalogueData = {
    packages: packages.map(({ name, version }) => ({ name, version })),
    entries: catalogue.entries,
  };
  writeFileSync(
    join(API_OUTPUT, CATALOGUE_FILE_NAME),
    `${JSON.stringify(data, null, 2)}\n`,
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
