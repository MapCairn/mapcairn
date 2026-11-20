// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  checkPackage,
  classifyFile,
  exportTargetsOf,
  SIZE_CEILINGS,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/packCheck.mjs";

/** A manifest as the SDK packages have it, with one stylesheet. */
function manifest(overrides: Record<string, unknown> = {}) {
  return {
    name: "@mapcairn/example",
    version: "0.0.0",
    private: true,
    publishConfig: { access: "public" },
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        "@mapcairn/source": "./src/index.ts",
        types: "./dist/index.d.ts",
        default: "./dist/index.js",
      },
      "./styles.css": {
        types: "./dist/styles.css.d.ts",
        default: "./dist/styles.css",
      },
    },
    files: ["dist", "!dist/.built"],
    ...overrides,
  };
}

const GOOD_FILES = [
  "LICENSE",
  "README.md",
  "package.json",
  "dist/index.js",
  "dist/index.js.map",
  "dist/index.d.ts",
  "dist/styles.css",
  "dist/styles.css.d.ts",
];

/** A listing as `npm pack --dry-run --json` prints it. */
function listing(files: readonly string[], size = 1000) {
  return {
    size,
    unpackedSize: size * 4,
    files: files.map((file) => ({ path: file, size: 10, mode: 420 })),
  };
}

function problems(
  files: readonly string[],
  overrides: Record<string, unknown> = {},
  size = 1000,
) {
  return checkPackage({
    manifest: manifest(overrides),
    listing: listing(files, size),
    ceiling: 5000,
  }) as string[];
}

describe("classifyFile", () => {
  it.each([
    "package.json",
    "README.md",
    "LICENSE",
    "dist/index.js",
    "dist/index.js.map",
    "dist/index.d.ts",
    "dist/contracts.d.ts",
    "dist/styles.css",
    "dist/styles.css.d.ts",
    "dist/chrome/Attribution/Attribution.styles.js",
  ])("accepts %s", (file) => {
    expect(classifyFile(file)).toBeUndefined();
  });

  it.each([
    ["dist/.built", "dotfile"],
    [".env", "dotfile"],
    ["dist/.env.local", "dotfile"],
    ["dist/sub/.hidden.js", "dotfile"],
    [".npmrc", "dotfile"],
    ["src/index.ts", "outside"],
    ["src/index.test.ts", "outside"],
    ["CHANGELOG.md", "outside"],
    ["tsconfig.json", "outside"],
    ["vite.config.ts", "outside"],
    ["api/index.api.md", "outside"],
    ["dist/index.test.js", "test"],
    ["dist/index.test.d.ts", "test"],
    ["dist/index.spec.js", "test"],
    ["dist/index.snap.html", "test"],
    ["dist/__snapshots__/index.js", "snapshot"],
    ["dist/data.json", "extension"],
    ["dist/places.geojson", "extension"],
    ["dist/tiles.pmtiles", "extension"],
    ["dist/logo.png", "extension"],
    ["dist/font.woff2", "extension"],
    ["dist/index.ts", "extension"],
    ["dist/page.html", "extension"],
    ["dist/index.d.ts.map", "extension"],
    ["dist/README.md", "extension"],
  ])("rejects %s (%s)", (file, reason) => {
    expect(classifyFile(file)).toContain(reason);
  });
});

describe("exportTargetsOf", () => {
  it("lists every file an export or the types field names, except the source condition", () => {
    expect(exportTargetsOf(manifest())).toEqual([
      "dist/index.d.ts",
      "dist/index.js",
      "dist/styles.css.d.ts",
      "dist/styles.css",
    ]);
  });

  it("reads a plain string export", () => {
    expect(exportTargetsOf({ exports: { "./a": "./dist/a.js" } })).toEqual([
      "dist/a.js",
    ]);
  });
});

describe("checkPackage", () => {
  it("passes a package that ships its dist, its manifest, a README and a LICENSE", () => {
    expect(problems(GOOD_FILES)).toEqual([]);
  });

  it("names each file outside the allowed set", () => {
    const found = problems([...GOOD_FILES, "src/index.ts", "dist/.built"]);
    expect(found).toHaveLength(2);
    expect(found.join("\n")).toContain("src/index.ts");
    expect(found.join("\n")).toContain("dist/.built");
  });

  it("fails when an export target is not in the tarball, but not for the source condition", () => {
    const files = GOOD_FILES.filter((file) => file !== "dist/index.d.ts");
    const found = problems(files);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("dist/index.d.ts");
  });

  it("fails when the package is over its size ceiling", () => {
    expect(problems(GOOD_FILES, {}, 5001).join("\n")).toMatch(/size/);
    expect(problems(GOOD_FILES, {}, 5000)).toEqual([]);
  });

  it("fails on a `files` list that adds anything beside dist or drops the stamp exclusion", () => {
    expect(
      problems(GOOD_FILES, { files: ["dist", "!dist/.built", "src"] }).join(
        "\n",
      ),
    ).toMatch(/files/);
    expect(problems(GOOD_FILES, { files: ["dist"] }).join("\n")).toMatch(
      /files/,
    );
    expect(problems(GOOD_FILES, { files: undefined }).join("\n")).toMatch(
      /files/,
    );
  });

  it("fails when publishConfig is not public access", () => {
    expect(
      problems(GOOD_FILES, { publishConfig: undefined }).join("\n"),
    ).toMatch(/publishConfig/);
    expect(
      problems(GOOD_FILES, { publishConfig: { access: "restricted" } }).join(
        "\n",
      ),
    ).toMatch(/publishConfig/);
  });

  it("fails on a main field, which the packages do not have", () => {
    expect(
      problems(GOOD_FILES, { main: "./dist/index.js" }).join("\n"),
    ).toMatch(/main/);
  });

  it("does not mind that the package is private, since packing one is allowed", () => {
    expect(problems(GOOD_FILES, { private: true })).toEqual([]);
  });
});

describe("SIZE_CEILINGS", () => {
  it("has one for each SDK package", () => {
    expect(Object.keys(SIZE_CEILINGS).sort()).toEqual([
      "core",
      "map",
      "react",
      "theme",
    ]);
    for (const ceiling of Object.values(SIZE_CEILINGS)) {
      expect(ceiling).toBeGreaterThan(0);
    }
  });
});
