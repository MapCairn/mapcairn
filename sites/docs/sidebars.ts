// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { SidebarEntry } from "./scripts/docChecks";

/**
 * The documentation's one sidebar. Every page in `docs/` must be listed
 * here: `scripts/verifyBuild.ts` and `scripts/docChecks.test.ts` fail the
 * build on a page that is not.
 */
export const sidebar: SidebarEntry[] = ["get-started"];

/** The sidebars Docusaurus reads. */
export default { docs: sidebar };
