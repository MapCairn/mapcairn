// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The engine's worker script, as text. The bundle build replaces this module
 * with the file named under `mapcairn.bundle.embed` in `package.json`, so the
 * bundle carries its own worker and a page serves no file for it. Tests and
 * type checks see this empty placeholder.
 */
const workerSource: string = "";

export default workerSource;
