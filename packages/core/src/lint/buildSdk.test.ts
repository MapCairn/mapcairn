// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  entryPointsOf,
  isExternal,
  stylesheetOf,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/buildPackage.mjs";
import {
  isStale,
  newestInput,
  newestSharedInput,
  SDK_BUILD_ORDER,
  sdkDependenciesOf,
  stampTime,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/buildSdk.mjs";

const SECOND = 1000;

let scratch = "";

/** Writes a file and sets its modified time to `seconds` after the epoch. */
function write(relative: string, seconds: number): void {
  const target = path.join(scratch, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, "x");
  utimesSync(target, seconds, seconds);
}

beforeEach(() => {
  scratch = mkdtempSync(path.join(tmpdir(), "mapcairn-build-sdk-"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("SDK_BUILD_ORDER", () => {
  it("builds a package after the SDK packages it depends on", () => {
    expect(SDK_BUILD_ORDER).toEqual([
      "core",
      "react",
      "theme",
      "map",
      "sdk",
      "adapter-maplibre",
    ]);
  });
});

describe("sdkDependenciesOf", () => {
  it("names the SDK packages a manifest depends on, in build order", () => {
    expect(
      sdkDependenciesOf({
        dependencies: {
          "@mapcairn/theme": "^0.0.0",
          "@mapcairn/core": "^0.0.0",
          react: "^19.0.0",
        },
      }),
    ).toEqual(["core", "theme"]);
  });

  it("is empty for a package that depends on none", () => {
    expect(sdkDependenciesOf({})).toEqual([]);
  });

  it("gives map the three packages it builds against", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(REPO, "packages/map/package.json"), "utf8"),
    );
    expect(sdkDependenciesOf(manifest)).toEqual(["core", "react", "theme"]);
  });
});

describe("newestInput", () => {
  it("is the newest of the sources and the manifest", () => {
    write("package.json", 10);
    write("src/a.ts", 30);
    write("src/nested/b.tsx", 20);
    expect(newestInput(scratch)).toBe(30 * SECOND);
  });

  it("includes the package's tsconfig.json", () => {
    write("package.json", 10);
    write("src/a.ts", 20);
    write("tsconfig.json", 70);
    expect(newestInput(scratch)).toBe(70 * SECOND);
  });

  it("ignores test files and snapshots, which do not change the output", () => {
    write("package.json", 10);
    write("src/a.ts", 20);
    write("src/a.test.ts", 90);
    write("src/a.snap.html", 95);
    expect(newestInput(scratch)).toBe(20 * SECOND);
  });
});

describe("newestSharedInput", () => {
  it("is the newest of the files every package build reads", () => {
    for (const [file, seconds] of [
      ["tsconfig.base.json", 10],
      ["package-lock.json", 80],
      ["scripts/buildSdk.mjs", 20],
      ["scripts/buildPackage.mjs", 30],
      ["scripts/entryPoint.mjs", 40],
    ] as const) {
      write(file, seconds);
    }
    expect(newestSharedInput(scratch)).toBe(80 * SECOND);
  });

  it("counts each of the five files", () => {
    const files = [
      "tsconfig.base.json",
      "package-lock.json",
      "scripts/buildSdk.mjs",
      "scripts/buildPackage.mjs",
      "scripts/entryPoint.mjs",
    ];
    for (const newest of files) {
      for (const file of files) {
        write(file, file === newest ? 99 : 5);
      }
      expect(newestSharedInput(scratch), newest).toBe(99 * SECOND);
    }
  });
});

describe("isStale", () => {
  it("is stale for a package that was never built", () => {
    write("package.json", 10);
    write("src/a.ts", 10);
    expect(isStale(scratch)).toBe(true);
  });

  it("is stale when a source file is newer than the build", () => {
    write("package.json", 10);
    write("src/a.ts", 50);
    write("dist/.built", 40);
    expect(isStale(scratch)).toBe(true);
  });

  it("is stale when the manifest is newer than the build", () => {
    write("package.json", 50);
    write("src/a.ts", 10);
    write("dist/.built", 40);
    expect(isStale(scratch)).toBe(true);
  });

  it("is stale when the build script is newer than the build", () => {
    write("package.json", 10);
    write("src/a.ts", 10);
    // The build script is a real file with a recent time, so a stamp from the
    // start of the epoch is older than it although the package's own files
    // are older still.
    write("dist/.built", 40);
    expect(isStale(scratch)).toBe(true);
  });

  it("is stale when an SDK package it depends on was built after it", () => {
    write("package.json", 10);
    write("src/a.ts", 10);
    const future = Math.floor(Date.now() / SECOND) + 60;
    write("dist/.built", future);
    write("dependency/dist/.built", future + 30);
    expect(isStale(scratch, [path.join(scratch, "dependency")])).toBe(true);
  });

  it("stays fresh when every SDK package it depends on was built before it", () => {
    write("package.json", 10);
    write("src/a.ts", 10);
    const future = Math.floor(Date.now() / SECOND) + 60;
    write("dist/.built", future);
    write("dependency/dist/.built", future - 30);
    expect(isStale(scratch, [path.join(scratch, "dependency")])).toBe(false);
  });

  it("is stale when a dependency has no finished build", () => {
    write("package.json", 10);
    write("src/a.ts", 10);
    write("dist/.built", Math.floor(Date.now() / SECOND) + 60);
    expect(isStale(scratch, [path.join(scratch, "dependency")])).toBe(true);
  });

  it("stays fresh when only a test file is newer than the build", () => {
    write("package.json", 10);
    write("src/a.ts", 10);
    write("src/a.test.ts", 90);
    write("dist/.built", Math.floor(Date.now() / SECOND) + 60);
    expect(isStale(scratch)).toBe(false);
  });
});

describe("stampTime", () => {
  it("is missing for a package that was never built", () => {
    expect(stampTime(scratch)).toBeUndefined();
  });

  it("is the time the build finished", () => {
    write("dist/.built", 40);
    expect(stampTime(scratch)).toBe(40 * SECOND);
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
        "./tokens.css": {
          types: "./dist/tokens.css.d.ts",
          default: "./dist/tokens.css",
        },
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
    expect(
      stylesheetOf({
        "./tokens.css": {
          types: "./dist/tokens.css.d.ts",
          default: "./dist/tokens.css",
        },
      }),
    ).toBe("tokens");
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

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function scriptsOf(folder: string): Record<string, string> {
  return (
    JSON.parse(
      readFileSync(path.join(REPO, folder, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    }
  ).scripts;
}

describe("the root scripts", () => {
  const scripts = scriptsOf(".");

  it.each(["typecheck", "test", "test:coverage"])(
    "run %s after building the SDK packages",
    (name) => {
      expect(scripts[name]).toMatch(/^npm run build:sdk && /);
    },
  );

  it("builds the SDK packages once, then only the host and the example", () => {
    expect(scripts.build).toBe(
      "npm run build:sdk && npm run build -w @mapcairn/web && npm run build -w @mapcairn/example-embed",
    );
    expect(scripts["build:sdk"]).toBe("node scripts/buildSdk.mjs");
  });
});

describe("every package script", () => {
  it("avoids environment-variable prefixes and node conditions, which fail in the Windows shell", () => {
    const folders = [
      ".",
      ...["packages", "examples"].flatMap((parent) =>
        readdirSync(path.join(REPO, parent)).map((name) =>
          path.join(parent, name),
        ),
      ),
    ].filter((folder) => {
      try {
        readFileSync(path.join(REPO, folder, "package.json"));
        return true;
      } catch {
        return false;
      }
    });
    for (const folder of folders) {
      for (const [name, command] of Object.entries(scriptsOf(folder))) {
        expect(command, `${folder} ${name}`).not.toMatch(
          /^\s*[A-Z_]+=|NODE_OPTIONS|--conditions/,
        );
      }
    }
  });
});
