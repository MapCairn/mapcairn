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
    license: "AGPL-3.0-only",
    description: "An example package",
    repository: {
      type: "git",
      url: "git+https://github.com/MapCairn/mapcairn.git",
      directory: "packages/example",
    },
    homepage:
      "https://github.com/MapCairn/mapcairn/tree/main/packages/example#readme",
    bugs: { url: "https://github.com/MapCairn/mapcairn/issues" },
    keywords: ["mapcairn", "map"],
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

/** A source map the build could have written for `dist/index.js`. */
function sourceMap(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 3,
    file: "index.js",
    sources: ["../src/index.ts"],
    sourcesContent: ["export {};"],
    mappings: "",
    ...overrides,
  });
}

function problems(
  files: readonly string[],
  overrides: Record<string, unknown> = {},
  size = 1000,
  maps: Record<string, string> = { "dist/index.js.map": sourceMap() },
  sourceExists: (source: string) => boolean = () => true,
) {
  return checkPackage({
    manifest: manifest(overrides),
    listing: listing(files, size),
    ceiling: 5000,
    readFile: (file: string) => maps[file],
    sourceExists,
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

describe("the files every tarball needs", () => {
  it.each(["LICENSE", "README.md", "package.json"])(
    "fails without %s",
    (missing) => {
      const found = problems(GOOD_FILES.filter((file) => file !== missing));
      expect(found.join("\n")).toContain(missing);
    },
  );
});

describe("the licence", () => {
  it.each([undefined, "MIT", "AGPL-3.0-or-later", ""])(
    "fails when it is %j",
    (license) => {
      expect(problems(GOOD_FILES, { license }).join("\n")).toMatch(/license/);
    },
  );
});

describe("the metadata the npm page shows", () => {
  const repository = (overrides: Record<string, unknown>) => ({
    repository: {
      type: "git",
      url: "git+https://github.com/MapCairn/mapcairn.git",
      directory: "packages/example",
      ...overrides,
    },
  });

  it("accepts the manifest as the packages have it", () => {
    expect(problems(GOOD_FILES)).toEqual([]);
  });

  it.each([
    ["no repository", { repository: undefined }, /repository/],
    [
      "a repository written as a string",
      { repository: "github:MapCairn/mapcairn" },
      /repository/,
    ],
    [
      "another repository url",
      repository({ url: "git+https://github.com/other/mapcairn.git" }),
      /repository\.url/,
    ],
    [
      "a url in another capitalisation",
      repository({ url: "git+https://github.com/mapcairn/mapcairn.git" }),
      /repository\.url/,
    ],
    [
      "a url without git+",
      repository({ url: "https://github.com/MapCairn/mapcairn.git" }),
      /repository\.url/,
    ],
    [
      "no directory",
      repository({ directory: undefined }),
      /repository\.directory/,
    ],
    [
      "another directory",
      repository({ directory: "packages/core" }),
      /repository\.directory/,
    ],
    ["no homepage", { homepage: undefined }, /homepage/],
    ["no bugs url", { bugs: undefined }, /bugs/],
    [
      "another bugs url",
      { bugs: { url: "https://example.org/issues" } },
      /bugs/,
    ],
    ["no description", { description: undefined }, /description/],
    ["a blank description", { description: "  " }, /description/],
    ["no keywords", { keywords: undefined }, /keywords/],
    ["empty keywords", { keywords: [] }, /keywords/],
    ["a keyword that is not text", { keywords: ["map", 3] }, /keywords/],
  ])("fails on %s", (_label, overrides, pattern) => {
    expect(problems(GOOD_FILES, overrides).join("\n")).toMatch(pattern);
  });
});

describe("source maps", () => {
  const map = (overrides: Record<string, unknown>) => ({
    "dist/index.js.map": sourceMap(overrides),
  });

  it("accepts relative sources that resolve into the package's src", () => {
    expect(problems(GOOD_FILES, {}, 1000, map({}))).toEqual([]);
    expect(
      problems(
        GOOD_FILES,
        {},
        1000,
        map({ sourceRoot: "../", sources: ["src/index.ts"] }),
      ),
    ).toEqual([]);
  });

  it.each([
    ["an absolute sourceRoot", { sourceRoot: "/home/ci/work/" }],
    ["a Windows sourceRoot", { sourceRoot: "C:\\work\\" }],
    ["an absolute source", { sources: ["/home/ci/work/src/index.ts"] }],
    ["a Windows source", { sources: ["C:\\work\\src\\index.ts"] }],
    ["a file URL", { sources: ["file:///work/src/index.ts"] }],
    ["a source outside src", { sources: ["../package.json"] }],
    ["a source above the package", { sources: ["../../../../etc/passwd"] }],
    ["a source in node_modules", { sources: ["../node_modules/x/index.js"] }],
  ])("fails on %s", (_name, overrides) => {
    const found = problems(GOOD_FILES, {}, 1000, map(overrides));
    expect(found.length).toBeGreaterThan(0);
    expect(found.join("\n")).toContain("dist/index.js.map");
  });

  it("fails on a map that is not JSON, or has no sources", () => {
    expect(
      problems(GOOD_FILES, {}, 1000, { "dist/index.js.map": "{" }).join("\n"),
    ).toContain("dist/index.js.map");
    expect(
      problems(GOOD_FILES, {}, 1000, map({ sources: undefined })).join("\n"),
    ).toContain("dist/index.js.map");
  });

  it("fails when a source is not a file in the package's src", () => {
    const found = problems(GOOD_FILES, {}, 1000, map({}), () => false);
    expect(found.join("\n")).toContain("src/index.ts");
  });
});

describe("files the build did not make", () => {
  it("lets an entry point and the bundler's helper module have no map, and a styles map have no sources", () => {
    expect(
      problems(
        [
          ...GOOD_FILES.filter((file) => file !== "dist/index.js.map"),
          "dist/_virtual/_rolldown/runtime.js",
          "dist/a.styles.js",
          "dist/a.styles.js.map",
        ],
        {},
        1000,
        { "dist/a.styles.js.map": sourceMap({ sources: [] }) },
      ),
    ).toEqual([]);
  });

  it("does not let an ordinary map have no sources", () => {
    expect(
      problems(GOOD_FILES, {}, 1000, {
        "dist/index.js.map": sourceMap({ sources: [] }),
      }).join("\n"),
    ).toContain("no sources");
  });

  it("fails on a script with no source map, such as a stray dist/secret.js", () => {
    const found = problems([...GOOD_FILES, "dist/secret.js"]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("dist/secret.js");
  });

  it("fails on a script whose map names a source that does not exist", () => {
    const found = problems(
      [...GOOD_FILES, "dist/secret.js", "dist/secret.js.map"],
      {},
      1000,
      {
        "dist/index.js.map": sourceMap(),
        "dist/secret.js.map": sourceMap({ sources: ["../src/secret.ts"] }),
      },
      (source) => source !== "src/secret.ts",
    );
    expect(found.join("\n")).toContain("src/secret.ts");
  });

  it("fails on a source map with no script, a declaration or a stylesheet no export names", () => {
    expect(
      problems([...GOOD_FILES, "dist/orphan.js.map"]).join("\n"),
    ).toContain("dist/orphan.js.map");
    expect(problems([...GOOD_FILES, "dist/extra.d.ts"]).join("\n")).toContain(
      "dist/extra.d.ts",
    );
    expect(problems([...GOOD_FILES, "dist/extra.css"]).join("\n")).toContain(
      "dist/extra.css",
    );
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
