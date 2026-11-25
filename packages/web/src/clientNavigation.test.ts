// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = __dirname;

/** Every non-test source file under `src`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

/** React Router's client-side navigation, as an import or a call with a target. */
const CLIENT_NAVIGATION =
  /\b(?:Link|NavLink|Navigate|redirect)\b(?=[^;]*from "react-router")|\bnavigate\((?!0\))/;

/*
 * The product page runs no framework script (`app/scriptlessPage.ts`). A
 * client-side navigation to it would render its markup with nothing running,
 * so its copy buttons would stay hidden. Every link to it is a plain anchor,
 * which loads the document; `navigate(0)` is the error page's reload.
 */
describe("client-side navigation", () => {
  it("is not used anywhere in the app, so the product page is only ever loaded as a document", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => CLIENT_NAVIGATION.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
});
