// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGES = path.resolve(__dirname, "../../..");
const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.(test|spec|stories)\.tsx?$/;
const LANGUAGE_CASE_CHANGE = /toLocale(Lower|Upper)Case|lowerFirst|upperFirst/;

/** Every non-test source file under `packages/<name>/src`. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
        out.push(full);
      }
    }
  };
  for (const pkg of readdirSync(PACKAGES, { withFileTypes: true })) {
    if (pkg.isDirectory() && pkg.name !== "node_modules") {
      try {
        walk(path.join(PACKAGES, pkg.name, "src"));
      } catch {
        // A package without a `src` folder has nothing to scan.
      }
    }
  }
  return out;
}

describe("translated text", () => {
  it("is never re-cased in code, because a language decides where a capital belongs", () => {
    const offenders = sourceFiles()
      .filter((file) => LANGUAGE_CASE_CHANGE.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(PACKAGES, file));
    expect(offenders).toEqual([]);
  });
});
