// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SidebarEntry } from "./scripts/docChecks";

/** The sidebar entry for the API reference, which `scripts/generateApi.ts` writes. */
const API_SIDEBAR_FILE = fileURLToPath(
  new URL("./docs/api/_sidebar.json", import.meta.url),
);

/**
 * Reads the generated API reference's sidebar. A missing file stops the build
 * with the command that writes it, instead of leaving the reference out.
 */
function apiSidebar(): SidebarEntry {
  if (!existsSync(API_SIDEBAR_FILE)) {
    throw new Error(
      'docs/api/_sidebar.json is missing. Run "npm run generate -w @mapcairn/docs" to write the API reference.',
    );
  }
  return JSON.parse(readFileSync(API_SIDEBAR_FILE, "utf8")) as SidebarEntry;
}

/**
 * The documentation's one sidebar. Every page in `docs/` must be listed
 * here: `scripts/verifyBuild.ts` and `scripts/docChecks.test.ts` fail the
 * build on a page that is not. The API reference's part is written from the
 * packages' API models.
 */
export const sidebar: SidebarEntry[] = [
  "get-started",
  {
    type: "category",
    label: "Build an app",
    items: [
      "guides/embed-a-map",
      "guides/extending",
      "guides/translate-the-sdk",
      "guides/content-security-policy",
      "guides/serving-layers",
      "guides/serving-from-iis",
    ],
  },
  {
    type: "category",
    label: "Reference",
    items: [
      "guides/public-api",
      "guides/capability-matrix",
      "guides/performance",
      "guides/machine-readable-data",
    ],
  },
  apiSidebar(),
  {
    type: "category",
    label: "Architecture and design",
    items: ["generated/architecture", "generated/design"],
  },
  {
    type: "category",
    label: "About the project",
    items: ["guides/using-the-reference-site", "guides/licence", "roadmap"],
  },
];

/** The sidebars Docusaurus reads. */
export default { docs: sidebar };
