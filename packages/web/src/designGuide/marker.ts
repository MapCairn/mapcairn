// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * A unique string that appears in the build output only when a development
 * and test page (the style guide, the two-maps page) is bundled.
 * `packages/web/scripts/verifyNoTestSeam.mjs` fails a production build that
 * contains it and an e2e build that does not, so renaming it means updating
 * that script.
 */
export const DESIGN_GUIDE_MARKER = "MAPCAIRN_DESIGN_GUIDE_MARKER";
