// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  entryPointsOf,
  isExternal,
  stylesheetOf,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/buildPackage.mjs";
import {
  newestInput,
  SDK_BUILD_ORDER,
  stampTime,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/buildSdk.mjs";

const SECOND = 1000;

let folder = "";

/** Writes a file and sets its modified time to `seconds` after the epoch. */
function write(relative: string, seconds: number): void {
  const target = path.join(folder, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, "x");
  utimesSync(target, seconds, seconds);
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), "mapcairn-build-sdk-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe("SDK_BUILD_ORDER", () => {
  it("builds a package after the SDK packages it depends on", () => {
    expect(SDK_BUILD_ORDER).toEqual(["core", "react", "theme"]);
  });
});

describe("newestInput", () => {
  it("is the newest of the sources and the manifest", () => {
    write("package.json", 10);
    write("src/a.ts", 30);
    write("src/nested/b.tsx", 20);
    expect(newestInput(folder)).toBe(30 * SECOND);
  });

  it("ignores test files and snapshots, which do not change the output", () => {
    write("package.json", 10);
    write("src/a.ts", 20);
    write("src/a.test.ts", 90);
    write("src/a.snap.html", 95);
    expect(newestInput(folder)).toBe(20 * SECOND);
  });
});

describe("stampTime", () => {
  it("is missing for a package that was never built", () => {
    expect(stampTime(folder)).toBeUndefined();
  });

  it("is the time the build finished", () => {
    write("dist/.built", 40);
    expect(stampTime(folder)).toBe(40 * SECOND);
  });
});

describe("entryPointsOf", () => {
  it("names each built file after its entry point", () => {
    expect(
      entryPointsOf({
        ".": {
          "@mapcairn/source": "./src/index.ts",
          types: "./dist/index.d.ts",
          default: "./dist/index.js",
        },
        "./contracts": {
          "@mapcairn/source": "./src/contracts/index.ts",
          types: "./dist/contracts.d.ts",
          default: "./dist/contracts.js",
        },
        "./tokens.css": "./dist/tokens.css",
      }),
    ).toEqual({
      index: "./src/index.ts",
      contracts: "./src/contracts/index.ts",
    });
  });

  it("refuses an export that lacks the source or default condition", () => {
    expect(() => entryPointsOf({ ".": { types: "./x.d.ts" } })).toThrow(
      "@mapcairn/source",
    );
  });
});

describe("stylesheetOf", () => {
  it("finds the stylesheet export", () => {
    expect(stylesheetOf({ "./tokens.css": "./dist/tokens.css" })).toBe(
      "tokens",
    );
  });

  it("is undefined when a package ships no stylesheet", () => {
    expect(stylesheetOf({ ".": { default: "./dist/index.js" } })).toBe(
      undefined,
    );
  });
});

describe("isExternal", () => {
  it.each([
    ["react", true],
    ["@turf/area", true],
    ["node:path", true],
    ["./tokens", false],
    ["../ports/errors", false],
    ["/abs/path/file.ts", false],
    ["\0virtual:module", false],
  ])("treats %s as external: %s", (id, expected) => {
    expect(isExternal(id)).toBe(expected);
  });
});
