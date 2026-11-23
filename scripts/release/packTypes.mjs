// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Runs publint and Are the Types Wrong? (attw) over the packed tarball of each
 * SDK package, the files that would be published, and fails when either tool
 * reports a problem.
 *
 *   npm run pack:check
 *
 * publint finds `package.json` and file problems (an `exports` target that is
 * missing, a wrong `types` condition order). attw finds entry points whose types
 * do not resolve under each module resolution. Both are root devDependencies
 * and ship in no package.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { findTarballs, packTarballs } from "./packCheck.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** The largest output a tool may print, in bytes. */
const MAX_OUTPUT = 64 * 1024 * 1024;

/**
 * attw's profile for packages that publish ES modules only, as the SDK
 * packages do (`"type": "module"` and no CommonJS build). It leaves out the
 * `node10` resolution, which does not read `exports`, and the `node16`
 * resolution from a CommonJS file, which cannot `require` an ES module. The
 * three that matter stay: `node16` from an ES module, `bundler`, and the
 * module formats each entry point claims. No rule is ignored besides.
 */
export const ATTW_PROFILE = "esm-only";

/**
 * The arguments for attw on one tarball.
 *
 * @param {string} tarball The packed `.tgz`.
 * @returns {string[]}
 */
export function attwArguments(tarball) {
  return ["--profile", ATTW_PROFILE, "--no-emoji", "--no-color", tarball];
}

/**
 * The arguments for publint on one tarball. A warning fails too, so a package
 * is published with none.
 *
 * @param {string} tarball The packed `.tgz`.
 * @returns {string[]}
 */
export function publintArguments(tarball) {
  return ["run", "--strict", "--level", "warning", tarball];
}

/**
 * Where an installed tool's command line script is.
 *
 * @param {string} packageName The npm package, such as `publint`.
 * @param {string} [root] The repository root.
 * @returns {string} The absolute path of the script.
 */
export function toolBinary(packageName, root = REPO) {
  const folder = path.join(root, "node_modules", packageName);
  let manifest;
  try {
    manifest = JSON.parse(
      readFileSync(path.join(folder, "package.json"), "utf8"),
    );
  } catch {
    throw new Error(`${packageName} is not installed. Run npm ci first.`);
  }
  const bin =
    typeof manifest.bin === "string"
      ? manifest.bin
      : Object.values(manifest.bin ?? {})[0];
  if (typeof bin !== "string") {
    throw new Error(`${packageName} declares no command line script.`);
  }
  return path.join(folder, bin);
}

/** The two tools: what to call them in a report, the package, and their arguments. */
const TOOLS = [
  { name: "publint", packageName: "publint", argumentsFor: publintArguments },
  {
    name: "attw",
    packageName: "@arethetypeswrong/cli",
    argumentsFor: attwArguments,
  },
];

/**
 * @typedef {object} ToolResult
 * @property {number | null} status The exit status, or null when it did not run to the end.
 * @property {string} stdout
 * @property {string} stderr
 */

/**
 * Runs one tool with `node` and no shell.
 *
 * @param {string} name `publint` or `attw`.
 * @param {string[]} args The tool's arguments.
 * @returns {ToolResult}
 */
function runTool(name, args) {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (tool === undefined) {
    throw new Error(`There is no tool called ${name}.`);
  }
  const result = spawnSync(
    process.execPath,
    [toolBinary(tool.packageName), ...args],
    { encoding: "utf8", maxBuffer: MAX_OUTPUT },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.error ? String(result.error) : (result.stderr ?? ""),
  };
}

/**
 * Runs both tools on every tarball and says what failed.
 *
 * @param {Record<string, string>} tarballs The tarball of each package, by folder name.
 * @param {(name: string, args: string[]) => ToolResult} [run] Runs a tool; replaced in tests.
 * @returns {string[]} One entry for each failed run, naming the package and the tool and holding what the tool printed.
 */
export function typeCheckProblems(tarballs, run = runTool) {
  return Object.entries(tarballs).flatMap(([folderName, tarball]) =>
    TOOLS.flatMap((tool) => {
      const result = run(tool.name, tool.argumentsFor(tarball));
      if (result.status === 0) {
        return [];
      }
      const printed = `${result.stdout}\n${result.stderr}`.trim();
      return [`${folderName}: ${tool.name} failed:\n${printed}`];
    }),
  );
}

/**
 * Packs every SDK package into a temporary folder and runs both tools on the
 * tarballs, or on a folder of tarballs that is already there.
 *
 * @param {string | null} [folder] A folder of packed tarballs; null to pack.
 * @returns {string[]} The problems found.
 */
export function runPackTypes(folder = null) {
  if (folder !== null) {
    return typeCheckProblems(
      withFolder(folder, findTarballs(readdirSync(folder))),
    );
  }
  const destination = mkdtempSync(path.join(tmpdir(), "mapcairn-types-"));
  try {
    return typeCheckProblems(
      withFolder(destination, packTarballs(destination, REPO)),
    );
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}

/** The tarball names of a folder as absolute paths. */
function withFolder(folder, names) {
  return Object.fromEntries(
    Object.entries(names).map(([name, file]) => [
      name,
      path.join(folder, file),
    ]),
  );
}

if (isEntryPoint(import.meta.url)) {
  try {
    const flag = process.argv.indexOf("--tarballs");
    const problems = runPackTypes(flag === -1 ? null : process.argv[flag + 1]);
    for (const problem of problems) {
      console.error(problem);
    }
    if (problems.length === 0) {
      console.log("ok   publint and attw: no problem in any tarball");
    }
    process.exitCode = problems.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
