// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { SidebarEntry } from "./scripts/docChecks";

/**
 * The documentation's one sidebar. Every page in `docs/` must be listed
 * here: `scripts/verifyBuild.ts` and `scripts/docChecks.test.ts` fail the
 * build on a page that is not.
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
    ],
  },
  {
    type: "category",
    label: "Architecture and design",
    items: ["generated/architecture", "generated/design"],
  },
  {
    type: "category",
    label: "About the project",
    items: ["guides/using-the-reference-site", "guides/licence"],
  },
];

/** The sidebars Docusaurus reads. */
export default { docs: sidebar };
