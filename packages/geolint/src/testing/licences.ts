// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** The licences geolint's dependency tree may contain. */
export const PERMISSIVE_LICENCES: ReadonlySet<string> = new Set([
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Apache-2.0",
  "Unlicense",
  "CC0-1.0",
  "0BSD",
]);

/** A licence family that must never appear, whatever else is offered with it. */
const COPYLEFT = /(^|[^A-Za-z])(A|L)?GPL/i;

/**
 * Whether an SPDX licence expression is acceptable: every `AND` term must be
 * permissive, at least one `OR` alternative must be, and nothing may name a
 * GPL, LGPL or AGPL licence anywhere in the expression.
 */
export function isPermissive(expression: string): boolean {
  if (COPYLEFT.test(expression)) {
    return false;
  }
  const stripped = expression.replaceAll("(", " ").replaceAll(")", " ");
  return stripped
    .split(/\s+OR\s+/)
    .some((alternative) =>
      alternative
        .split(/\s+AND\s+/)
        .every((term) => PERMISSIVE_LICENCES.has(term.trim())),
    );
}

interface PackageJson {
  readonly name?: string;
  readonly license?: string | { readonly type?: string };
  readonly dependencies?: Readonly<Record<string, string>>;
}

/** The licence a manifest declares, or `undefined` when it declares none. */
export function declaredLicence(manifest: PackageJson): string | undefined {
  const { license } = manifest;
  if (typeof license === "string") {
    return license;
  }
  return license?.type;
}

function readManifest(directory: string): PackageJson {
  return JSON.parse(
    readFileSync(path.join(directory, "package.json"), "utf8"),
  ) as PackageJson;
}

/** Finds `node_modules/<name>` by walking up from a directory, as Node does. */
function locate(name: string, from: string): string | undefined {
  for (let directory = from; ; directory = path.dirname(directory)) {
    const candidate = path.join(directory, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
    if (path.dirname(directory) === directory) {
      return undefined;
    }
  }
}

/** A package found in the production tree, and the licence its manifest declares. */
export interface InstalledPackage {
  readonly name: string;
  /** The SPDX expression from the manifest, or undefined when it declares none. */
  readonly licence: string | undefined;
}

/**
 * Every package a published copy of the package would install: its
 * `dependencies`, and theirs, recursively. `devDependencies` are not part of
 * what a user installs, so they are not walked.
 */
export function productionTree(packageDirectory: string): InstalledPackage[] {
  const seen = new Map<string, InstalledPackage>();
  const queue: { manifest: PackageJson; directory: string }[] = [
    { manifest: readManifest(packageDirectory), directory: packageDirectory },
  ];
  for (let next = queue.shift(); next; next = queue.shift()) {
    for (const name of Object.keys(next.manifest.dependencies ?? {})) {
      const directory = locate(name, next.directory);
      if (directory === undefined) {
        throw new Error(`${name} is declared but not installed`);
      }
      const manifest = readManifest(directory);
      const key = `${name}@${directory}`;
      if (!seen.has(key)) {
        seen.set(key, { name, licence: declaredLicence(manifest) });
        queue.push({ manifest, directory });
      }
    }
  }
  return [...seen.values()];
}
