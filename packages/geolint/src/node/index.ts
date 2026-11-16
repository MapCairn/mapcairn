// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors

/**
 * The Node-only helpers behind the command: reading files, expanding globs and
 * linting files in worker threads. Import the engine from the package root to
 * lint without Node.
 */
export { expandInputs, fileChunks, NoMatchError, STDIN } from "./files.js";
export {
  type FixOutcome,
  type FixPlan,
  fixedPathFor,
  fixFile,
  planFixInputs,
} from "./fixFile.js";
export { type FileTask, lintFile } from "./lintFile.js";
export { mapInThreads } from "./pool.js";
