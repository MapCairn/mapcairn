// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** The packages an outside app installs. */
const SDK_PACKAGES = ["core", "map", "react", "theme"] as const;

/**
 * Directories and files that are test code shipped as modules, for a host's
 * own test runner. They import vitest and fast-check, which the host brings
 * with its tests, so the general check skips them. The contract suites are
 * the exception: a test below requires the packages they import to be
 * declared as optional peers of core.
 */
const TEST_SUPPORT =
  /(\.test\.tsx?$|\/contracts\/|\/propertyTesting\/|\/lint\/|TestHarness\.tsx?$|\.d\.ts$)/;

/**
 * Type-only modules that npm installs from `@types`, and that the SDK's
 * declared dependencies must therefore include. `react` is not mapped:
 * React is a peer, and a host that compiles TypeScript with React already
 * has `@types/react` for its own code, so the packages keep it as a
 * devDependency rather than ask for a second copy.
 */
const TYPES_PACKAGES: Readonly<Record<string, string>> = {
  geojson: "@types/geojson",
};

/** The custom export condition that points a build tool at source. */
const SOURCE_CONDITION = "@mapcairn/source";

/** Packages that build to `dist`: all four. */
const BUILT_PACKAGES = ["core", "map", "react", "theme"] as const;

/** The conditions an entry point of a built package carries, in order. */
interface ConditionalExport {
  readonly [SOURCE_CONDITION]: string;
  readonly types: string;
  readonly default: string;
}

/** A stylesheet export: an empty declaration for TypeScript, then the file. */
interface StylesheetExport {
  readonly types: string;
  readonly default: string;
}

/**
 * Every entry point each built SDK package offers, and nothing else. A
 * stylesheet is a plain path, since it has no source form.
 */
const BUILT_ENTRY_POINTS: Readonly<
  Record<
    (typeof BUILT_PACKAGES)[number],
    Record<string, ConditionalExport | StylesheetExport>
  >
> = {
  core: {
    ".": {
      [SOURCE_CONDITION]: "./src/index.ts",
      types: "./dist/index.d.ts",
      default: "./dist/index.js",
    },
    "./contracts": {
      [SOURCE_CONDITION]: "./src/contracts/index.ts",
      types: "./dist/contracts.d.ts",
      default: "./dist/contracts.js",
    },
  },
  map: {
    ".": {
      [SOURCE_CONDITION]: "./src/index.ts",
      types: "./dist/index.d.ts",
      default: "./dist/index.js",
    },
    "./styles.css": {
      types: "./dist/styles.css.d.ts",
      default: "./dist/styles.css",
    },
  },
  react: {
    ".": {
      [SOURCE_CONDITION]: "./src/index.ts",
      types: "./dist/index.d.ts",
      default: "./dist/index.js",
    },
  },
  theme: {
    ".": {
      [SOURCE_CONDITION]: "./src/index.ts",
      types: "./dist/index.d.ts",
      default: "./dist/index.js",
    },
    "./tokens.css": {
      types: "./dist/tokens.css.d.ts",
      default: "./dist/tokens.css",
    },
  },
};

/**
 * What each package's `sideEffects` lets a bundler drop. The JavaScript is
 * side-effect free; a stylesheet is not. `map` keeps its `.css.ts` pattern
 * too, because a host that resolves the source condition compiles those files
 * and their stylesheets must survive tree-shaking.
 */
const SIDE_EFFECTS: Readonly<Record<(typeof BUILT_PACKAGES)[number], unknown>> =
  {
    core: false,
    map: ["**/*.css", "**/*.css.ts"],
    react: false,
    theme: ["**/*.css"],
  };

/** Workspaces that depend on the SDK packages, beside the SDK packages. */
const INTERNAL_CONSUMERS = ["packages/web", "examples/embed"] as const;

interface Manifest {
  readonly name: string;
  readonly version?: string;
  /** Without it, any file in the package can be imported by path. */
  readonly exports?: Readonly<Record<string, unknown>>;
  readonly types?: string;
  readonly files?: readonly string[];
  readonly sideEffects?: boolean | readonly string[];
  readonly publishConfig?: { readonly access?: string };
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<
    Record<string, { readonly optional?: boolean }>
  >;
}

function manifestOf(name: string): Manifest {
  return JSON.parse(
    readFileSync(path.join(REPO, "packages", name, "package.json"), "utf8"),
  ) as Manifest;
}

/** The manifest of a workspace folder, relative to the repository. */
function manifestAt(folder: string): Manifest {
  return JSON.parse(
    readFileSync(path.join(REPO, folder, "package.json"), "utf8"),
  ) as Manifest;
}

/** The range an internal dependency must carry for a given SDK version. */
function expectedRange(version: string): string {
  return version.includes("-") ? version : `^${version}`;
}

/** Every shipped source file of a package, relative to the repository. */
function sourceFiles(name: string): string[] {
  return readdirSync(path.join(REPO, "packages", name, "src"), {
    recursive: true,
  })
    .map((file) => `packages/${name}/src/${String(file).replaceAll("\\", "/")}`)
    .filter((file) => /\.tsx?$/.test(file) && !TEST_SUPPORT.test(file));
}

/** Every contract module of `@mapcairn/core`, relative to the repository. */
function contractFiles(): string[] {
  return readdirSync(path.join(REPO, "packages/core/src/contracts"))
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => `packages/core/src/contracts/${file}`);
}

/** The npm package each bare import names, such as `@turf/area` or `react`. */
function importedPackages(file: string): Set<string> {
  const source = readFileSync(path.join(REPO, file), "utf8");
  const found = new Set<string>();
  for (const match of source.matchAll(
    /(?<![\w"'.])(?:from|import)\s*\(?\s*"(@?[\w-][\w.-]*(?:\/[\w.-]+)*)"/g,
  )) {
    const specifier = match[1] ?? "";
    const parts = specifier.split("/");
    const name = specifier.startsWith("@")
      ? parts.slice(0, 2).join("/")
      : (parts[0] ?? "");
    found.add(TYPES_PACKAGES[name] ?? name);
  }
  return found;
}

describe("SDK package manifests", () => {
  it.each(SDK_PACKAGES)(
    "@mapcairn/%s declares every package its source imports",
    (name) => {
      const manifest = manifestOf(name);
      const declared = new Set([
        manifest.name,
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
      ]);
      // A `*.css.ts` file is compiled away in `dist`, so what it imports from
      // vanilla-extract is a build-time dependency, kept in devDependencies.
      const buildTime = Object.keys(manifest.devDependencies ?? {}).filter(
        (dependency) => dependency.startsWith("@vanilla-extract/"),
      );
      const missing = new Set<string>();
      for (const file of sourceFiles(name)) {
        const allowed = file.endsWith(".css.ts")
          ? new Set([...declared, ...buildTime])
          : declared;
        for (const imported of importedPackages(file)) {
          if (!allowed.has(imported)) {
            missing.add(`${imported} (imported by ${file})`);
          }
        }
      }
      expect([...missing]).toEqual([]);
    },
  );

  it.each(BUILT_PACKAGES)(
    "@mapcairn/%s exposes only its entry points, with source, types and default conditions",
    (name) => {
      const { exports } = manifestOf(name);
      expect(exports).toEqual(BUILT_ENTRY_POINTS[name]);
      for (const entry of Object.values(exports ?? {})) {
        if (
          Object.hasOwn(entry as object, "default") &&
          !Object.hasOwn(entry as object, SOURCE_CONDITION)
        ) {
          // A stylesheet: types, then default.
          expect(Object.keys(entry as object)).toEqual(["types", "default"]);
          continue;
        }
        expect(Object.keys(entry as object)).toEqual([
          SOURCE_CONDITION,
          "types",
          "default",
        ]);
      }
    },
  );

  it.each(BUILT_PACKAGES)(
    "@mapcairn/%s ships dist and source, without tests, and declares its side effects",
    (name) => {
      const manifest = manifestOf(name);
      expect(manifest.files).toEqual([
        "dist",
        "!dist/.built",
        "src",
        "!src/**/*.test.*",
        "!src/**/*.snap.html",
        ...(name === "core" ? ["!src/propertyTesting/**"] : []),
      ]);
      expect(manifest.sideEffects).toEqual(SIDE_EFFECTS[name]);
      expect(manifest.publishConfig).toEqual({ access: "public" });
      expect(manifest).not.toHaveProperty("main");
      expect(manifest.types).toBe("./dist/index.d.ts");
    },
  );

  it.each(BUILT_PACKAGES)(
    "@mapcairn/%s stays private until the first release",
    (name) => {
      expect(manifestOf(name)).toHaveProperty("private", true);
    },
  );

  it.each(SDK_PACKAGES)(
    "@mapcairn/%s takes React from the host, as a peer",
    (name) => {
      const manifest = manifestOf(name);
      for (const shared of ["react", "react-dom"]) {
        expect(manifest.dependencies ?? {}).not.toHaveProperty(shared);
      }
    },
  );

  it("@mapcairn/core declares what its contracts entry point imports as optional peers", () => {
    const manifest = manifestOf("core");
    const imported = new Set(
      contractFiles().flatMap((file) => [...importedPackages(file)]),
    );
    expect([...imported]).toEqual(["vitest"]);
    for (const name of imported) {
      expect(manifest.peerDependencies).toHaveProperty(name);
      expect(manifest.peerDependenciesMeta?.[name]?.optional).toBe(true);
      expect(manifest.dependencies ?? {}).not.toHaveProperty(name);
    }
  });

  it("keeps the four SDK versions equal", () => {
    const versions = SDK_PACKAGES.map((name) => manifestOf(name).version);
    expect(new Set(versions).size).toBe(1);
    expect(versions[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it.each([
    ...SDK_PACKAGES.map((name) => `packages/${name}`),
    ...INTERNAL_CONSUMERS,
  ])(
    "%s depends on the SDK packages by version, never by file: path",
    (folder) => {
      const manifest = manifestAt(folder);
      const version = manifestOf("core").version ?? "";
      const internal = Object.entries({
        ...manifest.dependencies,
        ...manifest.peerDependencies,
      }).filter(([name]) =>
        SDK_PACKAGES.some((sdk) => name === `@mapcairn/${sdk}`),
      );
      for (const [name, range] of internal) {
        expect(range, `${folder} ${name}`).toBe(expectedRange(version));
      }
    },
  );
});
