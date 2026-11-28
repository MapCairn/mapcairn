// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The scripts a package build runs, from the one `npm run build:sdk` starts to
 * every module they import. A change to one of them can change what a package
 * builds, so a build stamp records their content (`hashBuildScripts`).
 */
export const BUILD_SCRIPTS = [
  "scripts/buildSdk.mjs",
  "scripts/buildPackage.mjs",
  "scripts/buildInputs.mjs",
  "scripts/buildBundle.mjs",
  "scripts/bundleLicences.mjs",
  "scripts/bundleOutput.mjs",
  "scripts/bundleSettings.mjs",
  "scripts/sdkLicences.mjs",
  "scripts/sdkLicences.allowlist.json",
  "scripts/entryPoint.mjs",
  "scripts/icons.mjs",
  "scripts/sdkPackages.mjs",
  "scripts/shareDeclarations.mjs",
];

/**
 * A hash of the content of the build scripts. It follows what the scripts say
 * and not when a file was last written, so a checkout that touches them
 * without changing them rebuilds nothing. Each script's length precedes its
 * text, so moving text from one script into the next changes the hash.
 *
 * @param {string} [root] The repository root.
 * @returns {string} A hexadecimal digest.
 */
export function hashBuildScripts(root = REPO) {
  const hash = createHash("sha256");
  for (const script of BUILD_SCRIPTS) {
    const content = readFileSync(path.join(root, script));
    hash.update(`${content.length}:`);
    hash.update(content);
  }
  return hash.digest("hex");
}
