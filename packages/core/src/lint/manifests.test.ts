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
 * with its tests, so they are not checked here.
 */
const TEST_SUPPORT =
  /(\.test\.tsx?$|\/contracts\/|\/propertyTesting\/|\/lint\/|TestHarness\.tsx?$|\.d\.ts$)/;

/** Type-only modules that npm installs from `@types`. */
const TYPES_PACKAGES: Readonly<Record<string, string>> = {
  geojson: "@types/geojson",
};

interface Manifest {
  readonly name: string;
  /** Without it, any file in the package can be imported by path. */
  readonly exports?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

function manifestOf(name: string): Manifest {
  return JSON.parse(
    readFileSync(path.join(REPO, "packages", name, "package.json"), "utf8"),
  ) as Manifest;
}

/** Every shipped source file of a package, relative to the repository. */
function sourceFiles(name: string): string[] {
  return readdirSync(path.join(REPO, "packages", name, "src"), {
    recursive: true,
  })
    .map((file) => `packages/${name}/src/${String(file).replaceAll("\\", "/")}`)
    .filter((file) => /\.tsx?$/.test(file) && !TEST_SUPPORT.test(file));
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
      const missing = new Set<string>();
      for (const file of sourceFiles(name)) {
        for (const imported of importedPackages(file)) {
          if (!declared.has(imported)) {
            missing.add(`${imported} (imported by ${file})`);
          }
        }
      }
      expect([...missing]).toEqual([]);
    },
  );

  it.each(SDK_PACKAGES)(
    "@mapcairn/%s exposes only its entry points",
    (name) => {
      expect(manifestOf(name).exports).toHaveProperty(".", "./src/index.ts");
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
});
