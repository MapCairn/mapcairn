// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SDK_PACKAGES } from "./apiChanges.mjs";
import { internalRange, parseVersion } from "./semver.mjs";

/** The scope the SDK packages are published under. */
const SCOPE = "@mapcairn/";

/** The dependency blocks of a manifest that can name an SDK package. */
const DEPENDENCY_BLOCKS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/** The package names of the four SDK packages. */
export const SDK_NAMES = SDK_PACKAGES.map((name) => `${SCOPE}${name}`);

/**
 * The manifest of every workspace, read from the `workspaces` patterns of the
 * root manifest (`folder/*` and plain folders).
 *
 * @param {string} root
 * @returns {Array<{ file: string, text: string, manifest: any }>} `file` is relative to the root, with forward slashes.
 */
export function readWorkspaceManifests(root) {
  const rootManifest = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  /** @type {string[]} */
  const folders = [];
  for (const pattern of rootManifest.workspaces ?? []) {
    if (pattern.endsWith("/*")) {
      const parent = pattern.slice(0, -2);
      const base = path.join(root, parent);
      if (existsSync(base)) {
        folders.push(
          ...readdirSync(base)
            .sort()
            .map((name) => `${parent}/${name}`),
        );
      }
    } else {
      folders.push(pattern);
    }
  }
  return folders
    .map((folder) => `${folder}/package.json`)
    .filter((file) => existsSync(path.join(root, file)))
    .map((file) => {
      const text = readFileSync(path.join(root, file), "utf8");
      return { file, text, manifest: JSON.parse(text) };
    });
}

/**
 * The indentation a JSON file uses, so a rewrite does not reformat it.
 *
 * @param {string} text
 * @returns {string | number}
 */
function indentOf(text) {
  const match = /^([ \t]+)"/m.exec(text);
  return match === null ? 2 : match[1];
}

/**
 * Sets a release in one manifest: its own version when it is an SDK package,
 * and every range that names an SDK package.
 *
 * @param {string} text The manifest text.
 * @param {string} version The release version.
 * @returns {string} The new text.
 */
export function setReleaseInManifest(text, version) {
  const parsed = parseVersion(version);
  if (parsed === null) {
    throw new Error(`${version} is not a version.`);
  }
  const manifest = JSON.parse(text);
  const range = internalRange(parsed);
  if (SDK_NAMES.includes(manifest.name)) {
    manifest.version = version;
  }
  for (const block of DEPENDENCY_BLOCKS) {
    for (const name of SDK_NAMES) {
      if (manifest[block]?.[name] !== undefined) {
        manifest[block][name] = range;
      }
    }
  }
  return `${JSON.stringify(manifest, null, indentOf(text))}\n`;
}

/**
 * What a release needs to know about the manifests: each SDK package's
 * version, and every internal range that does not match a version. The
 * readiness report uses it too.
 *
 * @param {string} root
 * @returns {{
 *   versions: Record<string, string>,
 *   consistent: boolean,
 *   version: string | null,
 *   rangeProblems: string[],
 * }} `version` is the shared version, null when the four differ.
 */
export function readSdkState(root) {
  const manifests = readWorkspaceManifests(root);
  /** @type {Record<string, string>} */
  const versions = {};
  for (const { manifest } of manifests) {
    if (SDK_NAMES.includes(manifest.name)) {
      versions[manifest.name] = String(manifest.version);
    }
  }
  const distinct = new Set(Object.values(versions));
  const consistent =
    Object.keys(versions).length === SDK_NAMES.length && distinct.size === 1;
  const version = consistent ? [...distinct][0] : null;
  const parsed = version === null ? null : parseVersion(version);
  const expected = parsed === null ? null : internalRange(parsed);
  const rangeProblems = manifests.flatMap(({ file, manifest }) =>
    DEPENDENCY_BLOCKS.flatMap((block) =>
      SDK_NAMES.filter(
        (name) =>
          manifest[block]?.[name] !== undefined &&
          manifest[block][name] !== expected,
      ).map(
        (name) =>
          `${file}: ${block} ${name} is ${manifest[block][name]}, expected ${expected ?? "a shared version"}`,
      ),
    ),
  );
  return { versions, consistent, version, rangeProblems };
}
