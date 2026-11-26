// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  entryPointSpecifiers,
  entrySource,
  nodeImportProblems,
  webpackBuildScript,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/entryPoints.mjs";

describe("entryPointSpecifiers", () => {
  it("lists each script entry of an exports map and leaves out styles and the manifest", () => {
    const exports = {
      ".": { types: "./a.d.ts", default: "./a.js" },
      "./map": { default: "./m.js" },
      "./styles.css": "./styles.css",
      "./package.json": "./package.json",
    };
    expect(entryPointSpecifiers("@mapcairn/sdk", exports)).toEqual([
      "@mapcairn/sdk",
      "@mapcairn/sdk/map",
    ]);
  });

  it("leaves out the contract suites, which are test code that needs the optional vitest peer", () => {
    const exports = {
      ".": "./a.js",
      "./contracts": "./c.js",
      "./core/contracts": "./cc.js",
    };
    expect(entryPointSpecifiers("@mapcairn/sdk", exports)).toEqual([
      "@mapcairn/sdk",
    ]);
  });

  it("leaves out a file the package copies for a page to serve, such as a worker script, which is no module an app imports", () => {
    const exports = {
      ".": { types: "./a.d.ts", default: "./dist/a.js" },
      "./browser/worker": {
        types: "./dist/w.d.ts",
        default: "./dist/browser-worker.js",
      },
    };
    expect(
      entryPointSpecifiers("@mapcairn/sdk", exports, {
        copied: ["browser-worker.js"],
      }),
    ).toEqual(["@mapcairn/sdk"]);
    expect(entryPointSpecifiers("@mapcairn/sdk", exports)).toEqual([
      "@mapcairn/sdk",
      "@mapcairn/sdk/browser/worker",
    ]);
  });

  it("can list the style entries instead", () => {
    const exports = { ".": "./a.js", "./styles.css": "./styles.css" };
    expect(
      entryPointSpecifiers("@mapcairn/map", exports, { styles: true }),
    ).toEqual(["@mapcairn/map/styles.css"]);
  });

  it("lists the one entry of a package with no exports map", () => {
    expect(entryPointSpecifiers("x", undefined)).toEqual(["x"]);
  });
});

describe("entrySource", () => {
  it("imports every specifier for its bindings", () => {
    expect(entrySource(["a", "b/c"])).toBe(
      'import * as entry0 from "a";\nimport * as entry1 from "b/c";\nexport { entry0, entry1 };\n',
    );
  });

  it("imports a style sheet with no binding", () => {
    expect(entrySource(["a/styles.css"])).toBe('import "a/styles.css";\n');
  });
});

describe("webpackBuildScript", () => {
  it("builds the entry for the web with webpack's own defaults", () => {
    const script = webpackBuildScript("entries.mjs");
    expect(script).toContain('"./entries.mjs"');
    expect(script).toContain('target: "web"');
  });
});

describe("nodeImportProblems", () => {
  let app = "";
  beforeEach(() => {
    app = mkdtempSync(path.join(tmpdir(), "mapcairn-entry-points-"));
    writeFileSync(
      path.join(app, "package.json"),
      '{"type":"module","private":true}',
    );
  });
  afterEach(() => {
    rmSync(app, { recursive: true, force: true });
  });

  /** Installs a one-file package that runs `source` when it loads. */
  function install(name: string, source: string) {
    const folder = path.join(app, "node_modules", name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify({ name, type: "module", exports: "./index.js" }),
    );
    writeFileSync(path.join(folder, "index.js"), source);
  }

  it("fails an entry point that reads window when it loads", () => {
    install("reads-window", "export const width = window.innerWidth;\n");
    const problems = nodeImportProblems(app, ["reads-window"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("reads-window");
    expect(problems[0]).toContain("window is not defined");
  });

  it("fails an entry point that reads document when it loads", () => {
    install("reads-document", "export const body = document.body;\n");
    expect(nodeImportProblems(app, ["reads-document"])[0]).toContain(
      "document is not defined",
    );
  });

  it("passes an entry point that only guards on window with typeof", () => {
    install(
      "guarded",
      'export const browser = typeof window !== "undefined";\n',
    );
    expect(nodeImportProblems(app, ["guarded"])).toEqual([]);
  });

  it("names each failing entry point and passes the others", () => {
    install("good", "export const a = 1;\n");
    install("bad", "document.title;\n");
    const problems = nodeImportProblems(app, ["good", "bad"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("bad");
  });
});
