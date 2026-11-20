// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Keeps the umbrella package (`@mapcairn/sdk`) a set of re-exports that cannot
 * drift from the packages it stands for: the four at its root, and the MapLibre
 * adapter at its `./adapter-maplibre` subpath only. The checks read manifests,
 * committed API reports and source text only; the runtime check is in
 * `packages/sdk/src/umbrella.test.ts`.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const UMBRELLA = "packages/sdk";
const PACKAGES = ["core", "map", "react", "theme"] as const;
/** The package the umbrella carries at a subpath only, never at its root, so the root holds no map engine. */
const ADAPTER = "adapter-maplibre";
const SUBPATH_ONLY = [ADAPTER] as const;
const SOURCE_CONDITION = "@mapcairn/source";

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;
  readonly exports: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<
    Record<string, { readonly optional?: boolean }>
  >;
  readonly sideEffects?: unknown;
}

function read(file: string): string {
  return readFileSync(path.join(REPO, file), "utf8");
}

function manifestAt(folder: string): Manifest {
  return JSON.parse(read(`${folder}/package.json`)) as Manifest;
}

/** The subpath the umbrella offers for one entry point of a package. */
function subpathOf(name: string, key: string): string {
  return key === "." ? `./${name}` : `./${name}/${key.slice(2)}`;
}

/** The file name the umbrella uses for a subpath: `./core/contracts` is `coreContracts`, `./adapter-maplibre` is `adapterMaplibre`. */
function fileOf(subpath: string): string {
  return subpath
    .slice(2)
    .split(/[/-]/)
    .map((part, index) =>
      index === 0 ? part : `${part[0]?.toUpperCase()}${part.slice(1)}`,
    )
    .join("");
}

/** What each of the five packages offers as a code entry point, by the umbrella's subpath. */
function mirroredEntryPoints(): Map<string, string> {
  const wanted = new Map<string, string>();
  for (const name of [...PACKAGES, ...SUBPATH_ONLY]) {
    for (const [key, target] of Object.entries(
      manifestAt(`packages/${name}`).exports,
    )) {
      if (SOURCE_CONDITION in target) {
        wanted.set(
          subpathOf(name, key),
          key === "."
            ? `@mapcairn/${name}`
            : `@mapcairn/${name}/${key.slice(2)}`,
        );
      }
    }
  }
  return wanted;
}

/** The names a committed API report exports, with the renames API Extractor writes. */
function exportedNames(report: string): string[] {
  const names = new Set<string>();
  for (const match of report.matchAll(
    /^export (?:declare )?(?:abstract )?(?:const enum|function|const|let|var|class|interface|type|enum|namespace)\s+([\w$]+)/gm,
  )) {
    names.add(match[1] ?? "");
  }
  for (const list of report.matchAll(/^export \{([^}]*)\}/gm)) {
    for (const entry of (list[1] ?? "").split(",")) {
      const name = entry
        .trim()
        .split(/\s+as\s+/)
        .at(-1);
      if (name) {
        names.add(name);
      }
    }
  }
  return [...names];
}

/** Names that two or more of the four packages export from their main entry point. */
function collisions(): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const name of PACKAGES) {
    for (const exported of exportedNames(
      read(`packages/${name}/api/index.api.md`),
    )) {
      owners.set(exported, [...(owners.get(exported) ?? []), name]);
    }
  }
  return new Map([...owners].filter(([, packages]) => packages.length > 1));
}

/**
 * An `export` of the form the umbrella may hold, with its clause (`*` or a
 * list of names) and the package it comes from.
 */
const REEXPORT =
  /^export\s+(?:type\s+)?(\*|\{[^}]*\})\s+from\s+"@mapcairn\/(core|map|react|theme|adapter-maplibre)(\/contracts)?"$/;

/**
 * The statements of a source text, without comments. The project's own
 * `typescript` is the native compiler and has no script API, so this is a
 * plain split: anything it cannot make sense of is not a re-export and is
 * reported as code of its own.
 */
function statementsOf(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim().replace(/\s+/g, " "))
    .filter((statement) => statement !== "");
}

/** What a source text holds besides `export ... from "@mapcairn/<package>"`, one statement each. */
function codeOfItsOwn(source: string): string[] {
  return statementsOf(source).filter((statement) => !REEXPORT.test(statement));
}

/** The explicit `export { Name } from "@mapcairn/<package>"` lines of a source text: name to package. */
function tieBreaks(source: string): Map<string, string> {
  const named = new Map<string, string>();
  for (const statement of statementsOf(source)) {
    const match = REEXPORT.exec(statement);
    if (match?.[1] === undefined || match[1] === "*") {
      continue;
    }
    for (const entry of match[1].slice(1, -1).split(",")) {
      const name = entry.trim();
      if (name !== "") {
        named.set(name, `@mapcairn/${match[2]}`);
      }
    }
  }
  return named;
}

function sourceFiles(): string[] {
  return readdirSync(path.join(REPO, UMBRELLA, "src"))
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .sort();
}

describe("@mapcairn/sdk manifest", () => {
  const manifest = manifestAt(UMBRELLA);

  it("is public, in the release set with the four packages", () => {
    expect(manifest.name).toBe("@mapcairn/sdk");
    expect(manifest.private).toBeUndefined();
  });

  it("is at the version of the four packages", () => {
    for (const name of PACKAGES) {
      expect(manifest.version).toBe(manifestAt(`packages/${name}`).version);
    }
  });

  it("depends on the four packages and the adapter at their exact version and on nothing else", () => {
    expect(manifest.dependencies).toEqual(
      Object.fromEntries(
        [...PACKAGES, ...SUBPATH_ONLY].map((name) => [
          `@mapcairn/${name}`,
          manifestAt(`packages/${name}`).version,
        ]),
      ),
    );
  });

  it("takes React and the map engine from the host, at the adapter's range, and repeats core's optional vitest peer", () => {
    expect(manifest.peerDependencies).toEqual({
      "maplibre-gl": manifestAt(`packages/${ADAPTER}`).peerDependencies?.[
        "maplibre-gl"
      ],
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      vitest: manifestAt("packages/core").peerDependencies?.vitest,
    });
    expect(manifest.peerDependenciesMeta).toEqual({
      vitest: { optional: true },
    });
  });

  it("keeps its stylesheet from being dropped by a bundler, and nothing else", () => {
    expect(manifest.sideEffects).toEqual(["**/*.css"]);
  });

  it("has a README with one Status line, and links the licence", () => {
    const readme = read(`${UMBRELLA}/README.md`);
    expect(readme.split("\n")[0]).toBe("# `@mapcairn/sdk`");
    const status = readme
      .split("\n")
      .filter((line) => line.startsWith("**Status:**"));
    expect(status).toHaveLength(1);
    expect(status[0]).not.toMatch(/not published to npm/i);
    expect(readme).toContain(
      "https://github.com/MapCairn/mapcairn/blob/main/packages/sdk/LICENSE",
    );
  });

  it("carries the repository's licence text", () => {
    expect(read(`${UMBRELLA}/LICENSE`)).toBe(read("LICENSE"));
  });

  it("exports the root, one subpath for each code entry point of the five packages, and its stylesheet", () => {
    expect(Object.keys(manifest.exports).sort()).toEqual(
      [".", "./styles.css", ...mirroredEntryPoints().keys()].sort(),
    );
  });

  it("has no test code at the root, so contracts are reachable only on their own subpath", () => {
    expect(Object.keys(manifest.exports)).toContain("./core/contracts");
    expect(
      statementsOf(read(`${UMBRELLA}/src/index.ts`)).filter((statement) =>
        statement.includes("contracts"),
      ),
    ).toEqual([]);
  });

  it("points each subpath at its own source, declarations and build", () => {
    for (const subpath of mirroredEntryPoints().keys()) {
      const file = fileOf(subpath);
      expect(manifest.exports[subpath]).toEqual({
        [SOURCE_CONDITION]: `./src/${file}.ts`,
        types: `./dist/${file}.d.ts`,
        default: `./dist/${file}.js`,
      });
    }
    expect(manifest.exports["."]).toEqual({
      [SOURCE_CONDITION]: "./src/index.ts",
      types: "./dist/index.d.ts",
      default: "./dist/index.js",
    });
    expect(manifest.exports["./styles.css"]).toEqual({
      types: "./dist/styles.css.d.ts",
      default: "./dist/styles.css",
    });
  });
});

describe("@mapcairn/sdk source", () => {
  it("holds one file for the root and one for each subpath, and nothing else", () => {
    expect(sourceFiles()).toEqual(
      [
        "index.ts",
        ...[...mirroredEntryPoints().keys()].map((s) => `${fileOf(s)}.ts`),
      ].sort(),
    );
  });

  it("holds only re-exports of the five packages", () => {
    for (const file of sourceFiles()) {
      expect(codeOfItsOwn(read(`${UMBRELLA}/src/${file}`)), file).toEqual([]);
    }
  });

  it("re-exports each subpath's package with a star export, never a copy", () => {
    for (const [subpath, specifier] of mirroredEntryPoints()) {
      expect(
        statementsOf(read(`${UMBRELLA}/src/${fileOf(subpath)}.ts`)),
      ).toEqual([`export * from "${specifier}"`]);
    }
  });

  it("leaves the adapter and the engine out of the root and every subpath but its own", () => {
    for (const file of sourceFiles()) {
      const text = read(`${UMBRELLA}/src/${file}`);
      const mentions = /adapter-maplibre|maplibre-gl/.test(
        statementsOf(text).join("\n"),
      );
      expect(mentions, file).toBe(file === "adapterMaplibre.ts");
    }
  });

  it("stars the four main entry points at the root, never contracts", () => {
    const stars = [
      ...read(`${UMBRELLA}/src/index.ts`).matchAll(
        /^export \* from "([^"]+)";$/gm,
      ),
    ].map((match) => match[1]);
    expect(stars.sort()).toEqual(PACKAGES.map((n) => `@mapcairn/${n}`).sort());
  });

  it("writes a tie-break for every name two of the four packages export, and for no other", () => {
    const written = tieBreaks(read(`${UMBRELLA}/src/index.ts`));
    expect([...written.keys()].sort()).toEqual([...collisions().keys()].sort());
    for (const [name, specifier] of written) {
      const owner = /^@mapcairn\/(core|map|react|theme)$/.exec(specifier)?.[1];
      expect(collisions().get(name), `${name} from ${specifier}`).toContain(
        owner,
      );
    }
  });

  it("settles the two known collisions as the plan decided", () => {
    const written = tieBreaks(read(`${UMBRELLA}/src/index.ts`));
    expect(written.get("ScaleBar")).toBe("@mapcairn/map");
    expect(written.get("ReadingDirection")).toBe("@mapcairn/core");
  });

  it("ships a three-line stylesheet that imports the tokens, then the map's styles, then the engine's", () => {
    expect(read(`${UMBRELLA}/src/styles.css`)).toBe(
      '@import "@mapcairn/theme/tokens.css";\n@import "@mapcairn/map/styles.css";\n@import "@mapcairn/adapter-maplibre/styles.css";\n',
    );
  });
});

describe("the checks themselves", () => {
  it("flag a statement of its own in the umbrella's source", () => {
    expect(
      codeOfItsOwn(
        'export * from "@mapcairn/map";\nexport const x = 1;\nimport "react";\n',
      ),
    ).toEqual(["export const x = 1", 'import "react"']);
  });

  it("flag a re-export of something that is not one of the four packages", () => {
    expect(codeOfItsOwn('export * from "lucide-react";\n')).toHaveLength(1);
    expect(codeOfItsOwn('export * from "./local";\n')).toHaveLength(1);
    expect(codeOfItsOwn('export * from "@mapcairn/web";\n')).toHaveLength(1);
    expect(codeOfItsOwn('export * from "maplibre-gl";\n')).toHaveLength(1);
  });

  it("read the names, the renames and the kinds of export an API report holds", () => {
    const report = [
      "export function a(): void;",
      "export const b: number;",
      "export interface C {}",
      "export type D = 1;",
      "export declare abstract class E {}",
      "export enum F {}",
      "export { blur_2 as blur }",
      "export { g, h as i }",
    ].join("\n");
    expect(exportedNames(report).sort()).toEqual(
      ["a", "b", "C", "D", "E", "F", "blur", "g", "i"].sort(),
    );
  });

  it("find a collision between two packages' reports", () => {
    expect(collisions().get("ReadingDirection")).toEqual(["core", "react"]);
    expect(collisions().get("ScaleBar")).toEqual(["core", "map"]);
  });
});
