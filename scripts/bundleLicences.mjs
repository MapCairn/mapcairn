// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  ALLOWLIST_FILE,
  allowedIdentifiers,
  isPackageLicenceAllowed,
  NO_LICENCE,
} from "./sdkLicences.mjs";

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
  return identifiersOf(expression).find((token) =>
    allowed.has(token.toLowerCase()),
  );
}

/**
 * The licence identifiers an expression names, without its operators and brackets.
 *
 * @param {string} expression
 * @returns {string[]}
 */
export function identifiersOf(expression) {
  return expression
    .split(/[\s()]+/)
    .filter(
      (token) =>
        token !== "" && !["AND", "OR", "WITH"].includes(token.toUpperCase()),
    );
}

/** A notice file, which Apache-2.0 (section 4(d)) and others ask a redistributor to keep. */
const NOTICE_FILE = /^notice(?:[-.][\w.-]+)?$/i;

/**
 * Every licence file and every notice file of a package, by file name, with
 * their text. A package with no licence file gives its README's licence
 * section instead, so something always carries its copyright when one exists.
 *
 * @param {BundledPackage} bundled
 * @returns {{ name: string, text: string }[]} Empty when the package has no licence text at all.
 */
function licenceTextsOf(bundled) {
  const files = readdirSync(bundled.directory)
    .filter(
      (file) =>
        (LICENCE_FILE.test(file) || NOTICE_FILE.test(file)) &&
        statSync(path.join(bundled.directory, file)).isFile(),
    )
    .sort();
  const texts = files.map((name) => ({
    name,
    text: readFileSync(path.join(bundled.directory, name), "utf8").trim(),
  }));
  if (files.some((file) => LICENCE_FILE.test(file))) {
    return texts;
  }
  const section = licenceSectionOfReadme(bundled.directory);
  return section === undefined
    ? []
    : [{ name: "README, licence section", text: section }, ...texts];
}

/**
 * For a package that ships no licence file, the licence section of its README
 * (a heading that starts with "License" or "Licence", up to the next heading),
 * which is where such a package puts the text and its copyright.
 *
 * @param {string} directory
 * @returns {string | undefined}
 */
export function licenceSectionOfReadme(directory) {
  const readme = readdirSync(directory).find((file) =>
    /^readme(\.\w+)?$/i.test(file),
  );
  if (readme === undefined) {
    return undefined;
  }
  const lines = readFileSync(path.join(directory, readme), "utf8").split(
    /\r?\n/,
  );
  const start = lines.findIndex((line) => /^#{1,6}\s*licen[cs]e\b/i.test(line));
  if (start === -1) {
    return undefined;
  }
  const level = /^#+/.exec(lines[start])?.[0].length ?? 1;
  const length = lines.slice(start + 1).findIndex((line) => {
    const heading = /^(#+)\s/.exec(line);
    return heading !== null && heading[1].length <= level;
  });
  const section = lines.slice(
    start + 1,
    length === -1 ? undefined : start + 1 + length,
  );
  const text = section.join("\n").trim();
  return text === "" ? undefined : text;
}

/**
 * The text of `THIRD-PARTY-NOTICES.md`: each bundled package with its
 * version, its licence (the one it is used under, when the licence offers a
 * choice, and every identifier that applies, when it joins several) and the
 * text of every licence file and notice file it ships, which hold its
 * copyright.
 *
 * @param {readonly BundledPackage[]} packages
 * @param {{ licences: Record<string, string>, packages: Record<string, { licence: string, reason: string }> }} allowlist
 * @param {string} [introduction] What the packages below are to the files that carry the notices.
 * @returns {string}
 * @throws {Error} When a package has no licence text to ship.
 */
export function noticesOf(
  packages,
  allowlist,
  introduction = "The files of `@mapcairn/sdk/browser` contain the packages below, under the licences shown.",
) {
  const allowed = allowedIdentifiers(allowlist);
  const sections = [...packages]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((bundled) => {
      const texts = licenceTextsOf(bundled);
      if (texts.length === 0) {
        throw new Error(
          `${bundled.name}@${bundled.version} is bundled and its package has no licence file, and its README has no licence section, to ship.`,
        );
      }
      const lines = [
        `## ${bundled.name} ${bundled.version}`,
        "",
        `Licence: ${bundled.licence}`,
      ];
      const choice = /\sOR\s/i.test(bundled.licence);
      const inUse = licenceInUse(bundled.licence, allowed);
      if (choice && inUse !== undefined) {
        lines.push(`Used under: ${inUse}`);
      } else if (/\sAND\s/i.test(bundled.licence)) {
        lines.push(
          `All of these apply: ${identifiersOf(bundled.licence).join(", ")}`,
        );
      }
      const bodies = texts.flatMap(({ name, text }) => [
        "",
        `${name}:`,
        "",
        "```text",
        text,
        "```",
      ]);
      return [...lines, ...bodies].join("\n");
    });
  return [
    "# Third-party notices",
    "",
    introduction,
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n");
}

/**
 * The folder of an installed package a package asks for, found the way Node
 * does: its own `node_modules`, then each parent's.
 *
 * @param {string} from A package folder.
 * @param {string} name
 * @returns {string | undefined}
 */
function installedFolder(from, name) {
  for (
    let folder = from;
    folder !== path.dirname(folder);
    folder = path.dirname(folder)
  ) {
    const candidate = path.join(folder, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * The packages and, for each, the production dependencies it needs, all the way
 * down, read from the installed manifests (`@types/*` left out). A package that
 * is prebuilt into a file the bundle holds, such as MapLibre's own, names what
 * it is built from only there, so the module graph cannot see it.
 *
 * @param {readonly { directory: string }[]} packages Package folders.
 * @returns {BundledPackage[]} Each once, sorted by name.
 */
export function withDependencies(packages) {
  /** @type {Map<string, BundledPackage>} */
  const found = new Map();
  /** @param {string} directory */
  const visit = (directory) => {
    if (found.has(directory)) {
      return;
    }
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "package.json"), "utf8"),
    );
    found.set(directory, {
      name: manifest.name,
      version: manifest.version ?? "?",
      licence:
        typeof manifest.license === "string" && manifest.license.trim() !== ""
          ? manifest.license.trim()
          : NO_LICENCE,
      directory,
    });
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      const folder = installedFolder(directory, dependency);
      if (folder === undefined) {
        throw new Error(
          `${manifest.name} needs ${dependency}, which is not installed.`,
        );
      }
      if (!dependency.startsWith("@types/")) {
        visit(folder);
      }
    }
  };
  for (const { directory } of packages) {
    visit(directory);
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The packages whose files a bundled package copied into itself, such as the
 * icon paths of `@mapcairn/map` (`mapcairn.icons` in its manifest). No module
 * of the bundle comes from them, so the module graph cannot name them.
 *
 * @param {Iterable<string>} moduleIds
 * @returns {{ directory: string }[]}
 */
function copiedSourcesOf(moduleIds) {
  const owners = new Set(
    [...moduleIds]
      .filter((id) => !id.startsWith("\0") && path.isAbsolute(id.split("?")[0]))
      .flatMap((id) => packageFolderOf(id) ?? []),
  );
  return [...owners].flatMap((owner) => {
    const manifest = JSON.parse(
      readFileSync(path.join(owner, "package.json"), "utf8"),
    );
    const from = manifest.mapcairn?.icons?.from;
    if (from === undefined) {
      return [];
    }
    const directory = installedFolder(owner, from);
    if (directory === undefined) {
      throw new Error(
        `${manifest.name} copies from ${from}, which is not installed.`,
      );
    }
    return [{ directory }];
  });
}

/**
 * Judges everything the bundle holds, and writes the notices file.
 *
 * @param {object} input
 * @param {Iterable<string>} input.moduleIds The modules that reached the output.
 * @param {readonly string[]} input.embeddedFolders The folders of the packages the embedded files come from.
 * @param {{ licences: Record<string, string>, packages: Record<string, { licence: string, reason: string }> }} input.allowlist
 * @param {string} input.file Where to write the notices.
 * @returns {BundledPackage[]} What the notices name.
 * @throws {Error} When a package's licence is not allowed, or one has no licence file.
 */
export function writeNotices({ moduleIds, embeddedFolders, allowlist, file }) {
  const ids = [...moduleIds];
  const packages = withDependencies([
    ...bundledPackagesOf(ids),
    ...copiedSourcesOf(ids),
    ...embeddedFolders.map((directory) => ({ directory })),
  ]);
  assertBundledLicences(packages, allowlist);
  writeFileSync(file, noticesOf(packages, allowlist));
  return packages;
}
