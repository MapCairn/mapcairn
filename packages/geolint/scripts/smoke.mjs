// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
/**
 * Proves the package builds, packs and runs on its own: builds it, packs it
 * with `npm pack`, installs the tarball into a temporary directory outside the
 * repository (so nothing from the workspace is on the module path), and runs
 * the installed command there.
 *
 *   node scripts/smoke.mjs
 *
 * It needs the npm registry, for the package's two dependencies. It exits
 * non-zero on the first check that fails, and always removes its temporary
 * directory.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SMOKE = path.join(PACKAGE, "scripts", "smoke");
const FIXTURES = path.join(PACKAGE, "fixtures");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32" && command === NPM,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function check(condition, message) {
  if (!condition) {
    throw new Error(`smoke test failed: ${message}`);
  }
  process.stdout.write(`ok: ${message}\n`);
}

function must(result, what) {
  if (result.status !== 0) {
    throw new Error(
      `${what} failed (exit ${result.status})\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

const work = mkdtempSync(path.join(tmpdir(), "geolint-smoke-"));
try {
  must(run(NPM, ["run", "build"], { cwd: PACKAGE }), "npm run build");
  const packed = must(
    run(NPM, ["pack", "--pack-destination", work, "--json"], { cwd: PACKAGE }),
    "npm pack",
  );
  const tarball = path.join(work, JSON.parse(packed.stdout)[0].filename);

  const project = path.join(work, "project");
  mkdirSync(project);
  writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify({ name: "geolint-smoke", private: true, type: "module" }),
  );
  must(
    run(
      NPM,
      ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"],
      { cwd: project },
    ),
    "npm install of the tarball",
  );

  const bin = path.join(
    project,
    "node_modules",
    "@mapcairn",
    "geolint",
    "dist",
    "cli",
    "bin.js",
  );
  const geolint = (...args) =>
    run(process.execPath, [bin, ...args], { cwd: work });

  const data = path.join(work, "data");
  cpSync(SMOKE, data, { recursive: true });
  cpSync(FIXTURES, path.join(data, "fixtures"), { recursive: true });

  check(geolint("--help").status === 0, "--help exits 0");
  const rules = geolint("--rules");
  check(
    rules.status === 0 && rules.stdout.includes("winding-order"),
    "--rules lists the rules",
  );
  check(
    geolint(path.join(data, "clean.geojson")).status === 0,
    "a clean file exits 0",
  );
  check(
    geolint(path.join(data, "dirty.geojson")).status === 2,
    "a file with an error exits 2",
  );
  check(
    geolint(path.join(data, "missing.geojson")).status === 3,
    "a missing file exits 3",
  );

  const sarif = JSON.parse(
    geolint("--format", "sarif", path.join(data, "dirty.geojson")).stdout,
  );
  check(
    sarif.version === "2.1.0" && sarif.runs[0].results.length > 0,
    "--format sarif writes SARIF with results",
  );

  const files = readdirSync(path.join(data, "fixtures"), { recursive: true })
    .filter((name) => String(name).endsWith(".geojson"))
    .map((name) => path.join(data, "fixtures", String(name)))
    .sort();
  const serial = geolint("--jobs", "1", ...files);
  const parallel = geolint("--jobs", "4", ...files);
  check(
    serial.stdout.length > 0 && serial.stdout === parallel.stdout,
    "output is identical with --jobs 1 and --jobs 4",
  );
  check(
    serial.status === parallel.status,
    "exit code is identical with any --jobs",
  );

  const piped = run(process.execPath, [bin, "-"], {
    cwd: work,
    input: JSON.stringify({ type: "Point", coordinates: [10, 20] }),
  });
  check(piped.status === 0, "standard input is read with -");
  process.stdout.write("smoke test passed\n");
} finally {
  rmSync(work, { recursive: true, force: true });
}
