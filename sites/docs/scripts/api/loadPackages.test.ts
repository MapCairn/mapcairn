// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCatalogue } from "./catalogue";
import { loadPackage, manifestEntries, starExports } from "./loadPackages";

const roots: string[] = [];

const DECLARATIONS = `
/**
 * Adds two numbers.
 *
 * @remarks
 * Longer text with a {@link Total} link.
 *
 * @param a - The first number.
 * @param b - The second number.
 * @returns The sum.
 * @example
 * \`\`\`ts
 * add(1, 2);
 *
 * add(3, 4);
 * \`\`\`
 * @since 0.1.0
 * @see {@link old}
 * @public
 */
export declare function add(a: number, b: number): number;

/**
 * The sum of something.
 * @public
 */
export declare interface Total {
    /** The value. */
    readonly value: number;
}

/**
 * The old way.
 * @deprecated Use {@link add}.
 * @public
 */
export declare const old: Total;

export declare const undocumented: number;

export { }
`;

/** A repository folder holding a package named \`@fixture/pkg\` with a built declaration file. */
function repository(options: { report: boolean }): string {
  const root = mkdtempSync(join(tmpdir(), "mapcairn-load-"));
  roots.push(root);
  const folder = join(root, "packages", "pkg");
  mkdirSync(join(folder, "dist"), { recursive: true });
  mkdirSync(join(folder, "src"), { recursive: true });
  mkdirSync(join(folder, "api"), { recursive: true });
  writeFileSync(
    join(folder, "package.json"),
    JSON.stringify({
      name: "@fixture/pkg",
      version: "1.2.3",
      description: "A fixture package",
      exports: {
        ".": {
          "@mapcairn/source": "./src/index.ts",
          types: "./dist/index.d.ts",
          default: "./dist/index.js",
        },
      },
    }),
  );
  writeFileSync(join(folder, "dist", "index.d.ts"), DECLARATIONS);
  writeFileSync(
    join(folder, "src", "index.ts"),
    "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
  );
  if (options.report) {
    writeFileSync(join(folder, "api", "index.api.md"), "report");
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("manifestEntries", () => {
  it("lists the entries that carry code, the main one first, and skips a stylesheet", () => {
    const entries = manifestEntries({
      name: "@fixture/pkg",
      version: "1.0.0",
      description: "",
      exports: {
        "./contracts": {
          "@mapcairn/source": "./src/contracts.ts",
          default: "./dist/contracts.js",
        },
        "./styles.css": { default: "./dist/styles.css" },
        ".": {
          "@mapcairn/source": "./src/index.ts",
          default: "./dist/index.js",
        },
        "./package.json": "./package.json",
      },
    });
    expect(entries).toEqual([
      { built: "index", specifier: "@fixture/pkg", source: "./src/index.ts" },
      {
        built: "contracts",
        specifier: "@fixture/pkg/contracts",
        source: "./src/contracts.ts",
      },
    ]);
  });
});

describe("starExports", () => {
  it("names the packages a source file re-exports whole, and not its own modules", () => {
    expect(
      starExports(
        'export * from "@fixture/core";\nexport * from "./local";\nexport { x } from "@fixture/ui";\nexport * from \'@fixture/map\';\n',
      ),
    ).toEqual(["@fixture/core", "@fixture/map"]);
  });
});

describe("loadPackage", () => {
  it("fails, naming the file, when a package's API report is not committed", async () => {
    const root = repository({ report: false });
    await expect(loadPackage(root, "pkg")).rejects.toThrow(
      "packages/pkg/api/index.api.md is missing",
    );
  });

  it("reads the summary, parameters, returns, example, since, deprecation and links of each export", async () => {
    const root = repository({ report: true });
    const pkg = await loadPackage(root, "pkg");
    expect(pkg).toMatchObject({
      name: "@fixture/pkg",
      version: "1.2.3",
      description: "A fixture package",
    });
    const exports = pkg.modules[0]?.exports ?? [];
    const add = exports.find((item) => item.name === "add");
    expect(add).toMatchObject({
      kind: "function",
      summary: "Adds two numbers.",
      returns: "The sum.",
      returnType: "number",
      since: "0.1.0",
    });
    expect(add?.parameters.map((p) => [p.name, p.type, p.description])).toEqual(
      [
        ["a", "number", "The first number."],
        ["b", "number", "The second number."],
      ],
    );
    expect(add?.remarks).toContain("[`Total`](api-link:Total)");
    expect(add?.examples[0]).toContain("add(1, 2);");
    expect(add?.see).toEqual(["[`old`](api-link:old)"]);
    const old = exports.find((item) => item.name === "old");
    expect(old?.deprecated).toContain("Use [`add`](api-link:add).");
    const total = exports.find((item) => item.name === "Total");
    expect(total?.members[0]).toMatchObject({
      name: "value",
      kind: "property",
      summary: "The value.",
    });
  });

  it("builds a catalogue that names the export without a description and finds its source line", async () => {
    const root = repository({ report: true });
    const pkg = await loadPackage(root, "pkg");
    const catalogue = buildCatalogue([pkg], "https://example.com/repo");
    expect(catalogue.undocumented).toEqual(["undocumented (@fixture/pkg)"]);
    const page = catalogue.files.get("pkg/add.md") ?? "";
    expect(page).toContain("Added in 0.1.0.");
    expect(page).toContain("packages/pkg/src/index.ts:1");
    expect(page).toContain("[`Total`](./Total.md)");
    expect(page).not.toContain(" \n\n\n");
  }, 30_000);
});
