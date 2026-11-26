// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWLIST_FILE,
  allowedIdentifiers,
  isPackageLicenceAllowed,
  NO_LICENCE,
} from "./sdkLicences.mjs";

/** Where the texts of licences a package may leave out are kept, one `<identifier>.txt` each. */
export const LICENCE_TEXTS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "licenceTexts",
);

/**
 * Packages that are in a bundle's module graph and are not shipped in it:
 * the project's own (their licence is the repository's) and the build tool's
 * helper modules.
 */
const NOT_BUNDLED = /^(?:@mapcairn\/|vite$|rolldown$)/;

/** A file name that holds a licence text. */
const LICENCE_FILE = /^(?:licen[cs]e|copying)(?:[-.][\w.-]+)?$/i;

const NODE_MODULES = `${path.sep}node_modules${path.sep}`;

/**
 * The folder of the package a module of the bundle belongs to: the last
 * `node_modules/<name>` on its path, or, for a workspace package reached by
 * its real path, the nearest folder above it with a `package.json`.
 *
 * @param {string} file An absolute module path, possibly with a `?query`.
 * @returns {string | undefined}
 */
function packageFolderOf(file) {
  const bare = file.split("?")[0];
  const at = bare.lastIndexOf(NODE_MODULES);
  if (at !== -1) {
    const rest = bare.slice(at + NODE_MODULES.length).split(path.sep);
    const length = rest[0].startsWith("@") ? 2 : 1;
    return path.join(
      bare.slice(0, at),
      "node_modules",
      ...rest.slice(0, length),
    );
  }
  for (
    let folder = path.dirname(bare);
    folder !== path.dirname(folder);
    folder = path.dirname(folder)
  ) {
    if (existsSync(path.join(folder, "package.json"))) {
      return folder;
    }
  }
  return undefined;
}

/**
 * @typedef {object} BundledPackage
 * @property {string} name
 * @property {string} version
 * @property {string} licence The licence field, or `NO_LICENCE`.
 * @property {string} directory The package folder.
 */

/**
 * The third-party packages that reached a bundle, from the ids of its modules,
 * each once, sorted by name.
 *
 * @param {Iterable<string>} moduleIds
 * @returns {BundledPackage[]}
 */
export function bundledPackagesOf(moduleIds) {
  /** @type {Map<string, BundledPackage>} */
  const found = new Map();
  for (const id of moduleIds) {
    if (id.startsWith("\0") || !path.isAbsolute(id.split("?")[0])) {
      continue;
    }
    const directory = packageFolderOf(id);
    if (directory === undefined || found.has(directory)) {
      continue;
    }
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "package.json"), "utf8"),
    );
    if (NOT_BUNDLED.test(manifest.name ?? "")) {
      continue;
    }
    const licence =
      typeof manifest.license === "string" && manifest.license.trim() !== ""
        ? manifest.license.trim()
        : NO_LICENCE;
    found.set(directory, {
      name: manifest.name,
      version: manifest.version ?? "?",
      licence,
      directory,
    });
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What is wrong with the licences of the bundled packages: one message for
 * each package whose licence is not on the allowlist, judged as
 * `npm run licence:sdk` judges the packages' dependencies.
 *
 * @param {readonly BundledPackage[]} packages
 * @param {{ licences: Record<string, string>, packages: Record<string, { licence: string, reason: string }> }} allowlist
 * @returns {string[]}
 */
export function judgeBundledPackages(packages, allowlist) {
  return packages
    .filter(
      ({ name, licence }) =>
        !isPackageLicenceAllowed(
          name,
          licence === "" ? NO_LICENCE : licence,
          allowlist,
        ),
    )
    .map(
      ({ name, version, licence }) =>
        `${name}@${version} is licensed ${licence === "" ? NO_LICENCE : licence}, which is not on the allowlist, and it reaches the bundle. If it allows commercial use and carries no terms of its own, ask the maintainer to add it to "packages" in ${ALLOWLIST_FILE} with the reason; otherwise remove or replace the dependency.`,
    );
}

/**
 * Fails the build when a bundled package's licence is not allowed.
 *
 * @param {readonly BundledPackage[]} packages
 * @param {{ licences: Record<string, string>, packages: Record<string, { licence: string, reason: string }> }} allowlist
 * @throws {Error} Naming each package that is not allowed.
 */
export function assertBundledLicences(packages, allowlist) {
  const failures = judgeBundledPackages(packages, allowlist);
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}

/**
 * The identifier of the licence a package is used under: the first allowed
 * identifier of its expression, so `(EDL-1.0 OR EPL-1.0)` is used under
 * `EDL-1.0`.
 *
 * @param {string} expression
 * @param {ReadonlySet<string>} allowed Lower-case identifiers.
 * @returns {string | undefined}
 */
export function licenceInUse(expression, allowed) {
  const identifiers = expression
    .split(/[\s()]+/)
    .filter(
      (token) =>
        token !== "" && !["AND", "OR", "WITH"].includes(token.toUpperCase()),
    );
  return identifiers.find((token) => allowed.has(token.toLowerCase()));
}

/**
 * The licence text a package ships, from its own licence file, or failing
 * that the text this project keeps for the identifier it is used under.
 *
 * @param {BundledPackage} bundled
 * @param {string | undefined} inUse
 * @param {string} textsFolder
 * @returns {string | undefined}
 */
function licenceTextOf(bundled, inUse, textsFolder) {
  const own = readdirSync(bundled.directory)
    .filter(
      (file) =>
        LICENCE_FILE.test(file) &&
        statSync(path.join(bundled.directory, file)).isFile(),
    )
    .sort()[0];
  if (own !== undefined) {
    return readFileSync(path.join(bundled.directory, own), "utf8").trim();
  }
  const kept =
    inUse === undefined ? undefined : path.join(textsFolder, `${inUse}.txt`);
  return kept !== undefined && existsSync(kept)
    ? readFileSync(kept, "utf8").trim()
    : undefined;
}

/**
 * The text of `THIRD-PARTY-NOTICES.md`: each bundled package with its
 * version, its licence, the licence it is used under and the licence text.
 *
 * @param {readonly BundledPackage[]} packages
 * @param {{ licences: Record<string, string>, packages: Record<string, { licence: string, reason: string }> }} allowlist
 * @param {string} [textsFolder]
 * @returns {string}
 * @throws {Error} When a package has no licence text to ship.
 */
export function noticesOf(
  packages,
  allowlist,
  textsFolder = LICENCE_TEXTS_FOLDER,
) {
  const allowed = allowedIdentifiers(allowlist);
  const sections = [...packages]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((bundled) => {
      const inUse = licenceInUse(bundled.licence, allowed);
      const text = licenceTextOf(bundled, inUse, textsFolder);
      if (text === undefined) {
        throw new Error(
          `${bundled.name}@${bundled.version} is bundled and there is no licence text to ship: its package has no licence file, and ${textsFolder} has no text for ${inUse ?? bundled.licence}.`,
        );
      }
      const lines = [
        `## ${bundled.name} ${bundled.version}`,
        "",
        `Licence: ${bundled.licence}`,
      ];
      if (inUse !== undefined && inUse !== bundled.licence) {
        lines.push(`Used under: ${inUse}`);
      }
      return [...lines, "", "```text", text, "```"].join("\n");
    });
  return [
    "# Third-party notices",
    "",
    "The files of `@mapcairn/sdk/browser` contain the packages below, under the licences shown.",
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n");
}
