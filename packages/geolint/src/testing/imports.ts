// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import path from "node:path";

/** Every module specifier in a source file: static, re-export and dynamic. */
export function specifiers(source: string): string[] {
  const found: string[] = [];
  const pattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1] !== undefined) {
      found.push(match[1]);
    }
  }
  return found;
}

/**
 * Whether a specifier reaches outside the package: a workspace package name,
 * or a relative path that leaves the package's `src` directory.
 */
export function escapesPackage(
  specifier: string,
  fromFile: string,
  sourceRoot: string,
): boolean {
  if (specifier.startsWith("@mapcairn/") || specifier === "mapcairn") {
    return true;
  }
  if (!specifier.startsWith(".")) {
    return false;
  }
  const target = path.resolve(path.dirname(fromFile), specifier);
  return path.relative(sourceRoot, target).startsWith("..");
}
