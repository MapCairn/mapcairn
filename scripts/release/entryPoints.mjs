// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The consumer check's entry point legs (`consumerCheck.mjs`): every public
 * entry point of every package, read from the installed `exports` maps, is
 * imported in plain Node with no `window` or `document`, and is resolved by
 * Vite and webpack. Kept apart so the pure parts can be tested without
 * installing anything.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bundleOf } from "../bundleSettings.mjs";
import { isolatedEnvironment } from "./npm.mjs";

/** How long one Node import may take before it is cut off, in ms. */
const IMPORT_TIMEOUT = 60 * 1000;

/** The characters of an import error a failure message shows. */
const ERROR_EXCERPT = 600;

/**
 * Whether an export key names an entry an app imports at run time: not a
 * style sheet, the manifest or a contract suite. The contract suites are test
 * code that needs the optional `vitest` peer, so an app never ships them.
 */
function isScriptKey(key) {
  return (
    !key.endsWith(".css") &&
    key !== "./package.json" &&
    key !== "./contracts" &&
    !key.endsWith("/contracts")
  );
}

/**
 * Whether an export is one of the files the package copies into `dist`.
 *
 * @param {unknown} target The export's value.
 * @param {readonly string[]} copied
 * @returns {boolean}
 */
function isCopiedFile(target, copied) {
  const built =
    typeof target === "object" && target !== null
      ? Reflect.get(target, "default")
      : target;
  return typeof built === "string" && copied.includes(path.basename(built));
}

/**
 * The import specifiers of a package's public entry points.
 *
 * @param {string} name The package name.
 * @param {Record<string, unknown> | string | undefined} exports The
 *   package's `exports` field. Without a map the package has one entry.
 * @param {{ styles?: boolean, copied?: readonly string[] }} [options] With
 *   `styles`, list the style sheet entries instead of the script entries.
 *   `copied` names the files the package copies into `dist` for a page to
 *   serve (its worker script): an app does not import them, so they are not
 *   script entries.
 * @returns {string[]}
 */
export function entryPointSpecifiers(
  name,
  exports,
  { styles = false, copied = [] } = {},
) {
  if (exports === undefined || typeof exports === "string") {
    return styles ? [] : [name];
  }
  return Object.keys(exports)
    .filter((key) => key.startsWith(".") && key !== "./package.json")
    .filter((key) => (styles ? key.endsWith(".css") : isScriptKey(key)))
    .filter((key) => styles || !isCopiedFile(exports[key], copied))
    .map((key) => (key === "." ? name : `${name}/${key.slice(2)}`));
}

/**
 * A module that imports every specifier, which a bundler is asked to build.
 * A style sheet is imported for its effect alone.
 *
 * @param {string[]} specifiers
 * @returns {string}
 */
export function entrySource(specifiers) {
  const lines = [];
  const names = [];
  for (const [index, specifier] of specifiers.entries()) {
    if (specifier.endsWith(".css")) {
      lines.push(`import ${JSON.stringify(specifier)};`);
    } else {
      names.push(`entry${index}`);
      lines.push(
        `import * as entry${index} from ${JSON.stringify(specifier)};`,
      );
    }
  }
  if (names.length > 0) {
    lines.push(`export { ${names.join(", ")} };`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The script that builds `entry` with webpack for the web, with no loader and
 * no plugin, and fails on any error. Run it in the app, where webpack is
 * installed.
 *
 * @param {string} entry The entry module, relative to the app.
 * @returns {string}
 */
export function webpackBuildScript(entry) {
  return `import path from "node:path";
import webpack from "webpack";

const compiler = webpack({
  mode: "production",
  target: "web",
  context: process.cwd(),
  entry: ${JSON.stringify(`./${entry}`)},
  output: { path: path.resolve("dist/webpack") },
});
compiler.run((error, stats) => {
  const problem = error?.message ?? (stats?.hasErrors() ? stats.toString("errors-only") : "");
  compiler.close(() => {
    if (problem) {
      console.error(problem);
      process.exitCode = 1;
    }
  });
});
`;
}

/**
 * Imports each specifier in its own plain Node process, with no condition and
 * no bundler. Node has no `window` or `document`, so an entry point that reads
 * one when it loads throws. A `typeof window` guard is fine.
 *
 * @param {string} app The installed app.
 * @param {string[]} specifiers What to import.
 * @returns {string[]} One message for each specifier that failed.
 */
export function nodeImportProblems(app, specifiers) {
  const problems = [];
  for (const specifier of specifiers) {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `await import(${JSON.stringify(specifier)});`,
      ],
      {
        cwd: app,
        encoding: "utf8",
        timeout: IMPORT_TIMEOUT,
        env: isolatedEnvironment(),
      },
    );
    if (result.status !== 0) {
      const lines = result.stderr.split("\n").filter((line) => line !== "");
      const reason = lines.find((line) => /Error/.test(line)) ?? lines[0] ?? "";
      problems.push(
        `${specifier} does not import in plain Node: ${reason.slice(0, ERROR_EXCERPT)}`,
      );
    }
  }
  return problems;
}

/**
 * Every public entry point of the SDK packages installed in an app.
 *
 * @param {string} app The installed app.
 * @param {string[]} packages The package names, such as `@mapcairn/core`.
 * @param {{ styles?: boolean }} [options] See `entryPointSpecifiers`.
 * @returns {string[]}
 */
export function installedEntryPoints(app, packages, options) {
  return packages.flatMap((name) => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(app, "node_modules", ...name.split("/"), "package.json"),
        "utf8",
      ),
    );
    return entryPointSpecifiers(name, manifest.exports, {
      ...options,
      copied: Object.keys(bundleOf(manifest)?.copy ?? {}),
    });
  });
}
