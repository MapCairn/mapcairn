// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { isEntryPoint } from "./entryPoint.mjs";
import {
  MAIN_ENTRY,
  nameMainEntry,
  shareMainDeclarations,
} from "./shareDeclarations.mjs";

/** The export condition that points a build tool at source. */
export const SOURCE_CONDITION = "@mapcairn/source";

/** The stamp `buildSdk.mjs` compares with the sources, written last. */
export const STAMP_FILE = ".built";

/**
 * The compiler options API Extractor reads declarations with, for the rollup
 * here and for the reports in `apiReports.mjs`.
 */
export const ROLLUP_COMPILER_OPTIONS = {
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "Bundler",
  skipLibCheck: true,
  strict: true,
  lib: ["ES2022", "DOM", "DOM.Iterable"],
};

/** Where the compiler leaves declarations before they are rolled up. */
const DECLARATION_FOLDER = ".declarations";

/**
 * The entry points of a package: the exports that carry the source condition,
 * as the name of the built file (`index`, `contracts`) and its source.
 *
 * @param {Record<string, unknown>} exportsField The manifest `exports`.
 * @returns {Record<string, string>} Output name to source path.
 */
export function entryPointsOf(exportsField) {
  /** @type {Record<string, string>} */
  const entries = {};
  for (const target of Object.values(exportsField)) {
    if (typeof target !== "object" || target === null) {
      continue;
    }
    const source = Reflect.get(target, SOURCE_CONDITION);
    const built = Reflect.get(target, "default");
    if (typeof built === "string" && built.endsWith(".css")) {
      continue;
    }
    if (typeof source !== "string" || typeof built !== "string") {
      throw new Error(`An export needs ${SOURCE_CONDITION} and default.`);
    }
    entries[path.basename(built, ".js")] = source;
  }
  return entries;
}

/**
 * The stylesheet a package ships: an export whose `default` is a `.css` file,
 * with a `types` condition pointing at an empty declaration so TypeScript
 * accepts the import. Its presence is what makes the build compile `.css.ts`
 * files.
 *
 * @param {Record<string, unknown>} exportsField The manifest `exports`.
 * @returns {string | undefined} The file name without its extension.
 */
export function stylesheetOf(exportsField) {
  for (const target of Object.values(exportsField)) {
    const built =
      typeof target === "object" && target !== null
        ? Reflect.get(target, "default")
        : undefined;
    if (typeof built === "string" && built.endsWith(".css")) {
      return path.basename(built, ".css");
    }
  }
  return undefined;
}

/**
 * The stylesheet a package writes by hand: an export whose `default` is a
 * `.css` file with a source of the same name in `src`. The build copies it
 * as it is; a package whose stylesheet is compiled from `.css.ts` files has
 * no such source.
 *
 * @param {string} folder The package folder.
 * @param {string | undefined} stylesheet The name `stylesheetOf` found.
 * @returns {boolean}
 */
export function hasHandWrittenStylesheet(folder, stylesheet) {
  return (
    stylesheet !== undefined &&
    existsSync(path.join(folder, "src", `${stylesheet}.css`))
  );
}

/**
 * Whether an import names another package or a built-in rather than a file in
 * this one. Every such import stays external, so the output never bundles a
 * dependency.
 *
 * @param {string} id The import specifier or resolved id.
 * @returns {boolean}
 */
export function isExternal(id) {
  return !(id.startsWith(".") || path.isAbsolute(id) || id.startsWith("\0"));
}

/**
 * Builds the JavaScript, one module per source module, with the extensions
 * added to relative imports.
 *
 * @param {string} folder The package folder.
 * @param {Record<string, string>} entries Output name to source path.
 * @param {string | undefined} stylesheet The name of the one stylesheet the
 *   package ships, without its extension, or `undefined` when it has none.
 */
async function buildJavaScript(folder, entries, stylesheet) {
  const { build } = await import("vite");
  const plugins = [];
  if (stylesheet !== undefined) {
    const { vanillaExtractPlugin } = await import(
      "@vanilla-extract/vite-plugin"
    );
    plugins.push(vanillaExtractPlugin());
  }
  await build({
    root: folder,
    configFile: false,
    logLevel: "warn",
    plugins,
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: true,
      minify: false,
      cssCodeSplit: false,
      lib: {
        formats: ["es"],
        cssFileName: stylesheet,
        entry: Object.fromEntries(
          Object.entries(entries).map(([name, source]) => [
            name,
            path.resolve(folder, source),
          ]),
        ),
      },
      rolldownOptions: {
        external: isExternal,
        output: {
          preserveModules: true,
          preserveModulesRoot: "src",
          // vanilla-extract's plugin compiles every `*.css.js` file it meets, so
          // a built `tokens.css.js` would be compiled a second time in a host.
          entryFileNames: (chunk) =>
            `${chunk.name.replace(/\.css$/, ".styles")}.js`,
          assetFileNames: "[name][extname]",
        },
      },
    },
  });
}

/**
 * Emits declarations for every source file into a scratch folder.
 *
 * @param {string} folder The package folder.
 */
function emitDeclarations(folder) {
  const tsc = path.join(
    path.dirname(
      createRequire(import.meta.url).resolve("typescript/package.json"),
    ),
    "bin",
    "tsc",
  );
  const result = spawnSync(
    process.execPath,
    [
      tsc,
      "-p",
      path.join(folder, "tsconfig.json"),
      "--declaration",
      "--emitDeclarationOnly",
      "--noEmit",
      "false",
      "--outDir",
      path.join(folder, "dist", DECLARATION_FOLDER),
    ],
    { cwd: folder, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error("tsc could not emit declarations.");
  }
}

/**
 * Rolls the declarations of one entry point into a single `.d.ts`.
 *
 * @param {string} folder The package folder.
 * @param {string} name The built file name.
 * @param {string} source The entry point's source path.
 * @param {string} packageJsonFullPath The manifest path.
 */
async function rollUpDeclarations(folder, name, source, packageJsonFullPath) {
  const { Extractor, ExtractorConfig } = await import(
    "@microsoft/api-extractor"
  );
  const entry = path
    .join("dist", DECLARATION_FOLDER, source.replace(/^\.\/src\//, ""))
    .replace(/\.tsx?$/, ".d.ts");
  const config = ExtractorConfig.prepare({
    configObjectFullPath: undefined,
    packageJsonFullPath,
    configObject: {
      projectFolder: folder,
      mainEntryPointFilePath: path.join("<projectFolder>", entry),
      compiler: {
        overrideTsconfig: {
          compilerOptions: ROLLUP_COMPILER_OPTIONS,
        },
      },
      apiReport: { enabled: false },
      docModel: { enabled: false },
      tsdocMetadata: { enabled: false },
      dtsRollup: {
        enabled: true,
        untrimmedFilePath: path.join("<projectFolder>", "dist", `${name}.d.ts`),
      },
      messages: {
        compilerMessageReporting: { default: { logLevel: "warning" } },
        extractorMessageReporting: {
          default: { logLevel: "none" },
          "ae-wrong-input-file-type": { logLevel: "error" },
        },
        tsdocMessageReporting: { default: { logLevel: "none" } },
      },
    },
  });
  const result = Extractor.invoke(config, {
    localBuild: true,
    showVerboseMessages: false,
  });
  if (!result.succeeded) {
    throw new Error(`API Extractor failed for ${name}.`);
  }
}

/**
 * Builds one SDK package into `dist`: JavaScript, rolled-up declarations and,
 * for a package that compiles styles, its stylesheet. A stamp file is written
 * last, so `buildSdk.mjs` can tell a finished build from a partial one.
 *
 * @param {string} folder The package folder.
 */
export async function buildPackage(folder) {
  const started = new Date();
  const manifestPath = path.join(folder, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entries = entryPointsOf(manifest.exports ?? {});
  const stylesheet = stylesheetOf(manifest.exports ?? {});
  const handWritten = hasHandWrittenStylesheet(folder, stylesheet);
  const dist = path.join(folder, "dist");
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  await buildJavaScript(folder, entries, handWritten ? undefined : stylesheet);
  if (stylesheet !== undefined) {
    // A stylesheet has no types, and a project that checks side-effect imports
    // (`noUncheckedSideEffectImports`) fails on an import it cannot resolve.
    writeFileSync(path.join(dist, `${stylesheet}.css.d.ts`), "export {};\n");
  }
  if (stylesheet !== undefined && handWritten) {
    copyFileSync(
      path.join(folder, "src", `${stylesheet}.css`),
      path.join(dist, `${stylesheet}.css`),
    );
  }
  emitDeclarations(folder);
  const declarationOf = (/** @type {string} */ source) =>
    path
      .join(dist, DECLARATION_FOLDER, source.replace(/^\.\/src\//, ""))
      .replace(/\.tsx?$/, ".d.ts");
  // The main entry rolls up first, so the others can import its types from the
  // package by name instead of repeating them.
  const ordered = Object.entries(entries).sort(
    ([a], [b]) => Number(b === MAIN_ENTRY) - Number(a === MAIN_ENTRY),
  );
  for (const [name, source] of ordered) {
    const main = entries[MAIN_ENTRY];
    if (name !== MAIN_ENTRY && main !== undefined) {
      shareMainDeclarations(
        path.join(dist, DECLARATION_FOLDER),
        declarationOf(main),
        declarationOf(source),
      );
    }
    await rollUpDeclarations(folder, name, source, manifestPath);
    if (name !== MAIN_ENTRY) {
      nameMainEntry(path.join(dist, `${name}.d.ts`), manifest.name);
    }
  }
  rmSync(path.join(dist, DECLARATION_FOLDER), { recursive: true, force: true });
  // The stamp is empty, so two builds of the same sources pack to the same
  // tarball, and carries the time the build started, so an edit made while
  // it ran is newer than the stamp and builds again.
  const stamp = path.join(dist, STAMP_FILE);
  writeFileSync(stamp, "");
  utimesSync(stamp, started, started);
}

if (isEntryPoint(import.meta.url)) {
  await buildPackage(process.cwd());
}
