// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Whether the module at `moduleUrl` is the script node was started with. Real
 * paths are compared, so a symbolic link or junction to the script, or to a
 * folder above it, does not make a command do nothing and exit 0.
 *
 * @param {string} moduleUrl Pass `import.meta.url`.
 * @returns {boolean}
 */
export function isEntryPoint(moduleUrl) {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
