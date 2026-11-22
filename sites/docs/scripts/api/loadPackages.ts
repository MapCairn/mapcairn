// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { LINK_MARKER, type ModuleInput, type PackageInput } from "./catalogue";
import { extractExports } from "./extract";
import { indexSource } from "./sourceLinks";

/** One `exports` entry of a package manifest that holds code (not a stylesheet). */
export interface ManifestEntry {
  /** The name of the built file, which names the API report: `index`, `contracts`. */
  readonly built: string;
  /** The import specifier: the package name, with the subpath after it. */
  readonly specifier: string;
  /** The source file, relative to the package. */
  readonly source: string;
}

/** The fields of a package manifest this module reads. */
export interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly exports?: Record<string, unknown>;
}

/** The source condition the manifests use for the file a workspace reads. */
const SOURCE_CONDITION = "@mapcairn/source";

/** An `export * from "x"` line, which re-exports another package whole. */
const STAR_EXPORT = /^export\s+\*\s+from\s+["']([^"']+)["']/gm;

function conditionOf(target: unknown, condition: string): unknown {
  return typeof target === "object" && target !== null
    ? Reflect.get(target, condition)
    : undefined;
}

/**
 * The entry points of a package that carry code, main entry first, as the
 * manifest's `exports` declares them.
 * @param manifest - The package manifest.
 */
export function manifestEntries(manifest: Manifest): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  for (const [key, target] of Object.entries(manifest.exports ?? {})) {
    const source = conditionOf(target, SOURCE_CONDITION);
    const built = conditionOf(target, "default");
    if (
      typeof source !== "string" ||
      typeof built !== "string" ||
      built.endsWith(".css")
    ) {
      continue;
    }
    entries.push({
      built: basename(built, ".js"),
      specifier:
        key === "." ? manifest.name : `${manifest.name}${key.slice(1)}`,
      source,
    });
  }
  const isMain = (entry: ManifestEntry): number =>
    Number(entry.specifier === manifest.name);
  return entries.sort((a, b) => isMain(b) - isMain(a));
}

/**
 * The specifiers an entry point's source re-exports whole, with `export *`.
 * @param source - The text of the entry's source file.
 */
export function starExports(source: string): string[] {
  return [...source.matchAll(STAR_EXPORT)]
    .map((match) => match[1] ?? "")
    .filter((specifier) => !specifier.startsWith("."));
}

/**
 * Reads one SDK package into what the catalogue builds from. It fails, naming
 * the file, when a committed API report is missing, so a package cannot be
 * left out of the reference without the build saying so.
 * @param repositoryRoot - The repository's folder.
 * @param dirName - The package's folder name under `packages/`.
 */
export async function loadPackage(
  repositoryRoot: string,
  dirName: string,
): Promise<PackageInput> {
  const folder = join(repositoryRoot, "packages", dirName);
  const manifest = JSON.parse(
    readFileSync(join(folder, "package.json"), "utf8"),
  ) as Manifest;
  const entries = manifestEntries(manifest);
  for (const entry of entries) {
    if (!existsSync(join(folder, "api", `${entry.built}.api.md`))) {
      throw new Error(
        `The API report packages/${dirName}/api/${entry.built}.api.md is missing, so ${entry.specifier} cannot be documented. Run "npm run api:update".`,
      );
    }
  }
  // Loaded when needed: the script is an ES module with a top-level await,
  // which this package's CommonJS loader cannot require.
  const { generateReports } = await import(
    "../../../../scripts/apiReports.mjs"
  );
  const { models } = await generateReports(folder);
  const scratch = mkdtempSync(join(tmpdir(), "mapcairn-api-docs-"));
  try {
    const sources = indexSource(repositoryRoot, join(folder, "src"));
    const modules: ModuleInput[] = entries.map((entry) => {
      const model = models.get(entry.built);
      if (model === undefined) {
        throw new Error(`No API model was written for ${entry.specifier}.`);
      }
      const file = join(scratch, `${entry.built}.api.json`);
      writeFileSync(file, model);
      return {
        specifier: entry.specifier,
        exports: extractExports(file, (name) => `${LINK_MARKER}${name}`),
        reExports: starExports(
          readFileSync(join(folder, entry.source), "utf8"),
        ),
        sources,
      };
    });
    return {
      dirName,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      modules,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
