// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
/**
 * The benchmark. It builds nothing: run `npm run build` first. It generates the
 * inputs (a 1 MB, a 50 MB and a 500 MB FeatureCollection, and one polygon of
 * 1,000,000 vertices) in a temporary directory, lints each in a fresh process,
 * prints a table with the machine's specification, and deletes the inputs.
 *
 *   npm run bench                 all sizes
 *   npm run bench -- --skip-large leave out the 500 MB file
 *
 * Targets (set before profiling, see the README): a FeatureCollection lints at
 * 15 MB/s or better on one thread and keeps peak memory under 400 MB whatever
 * its size; a polygon of 1,000,000 vertices lints in under 10 s.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeCollection, writePolygon } from "./generate.mjs";

const MEGABYTE = 1024 * 1024;
const POLYGON_VERTICES = 1_000_000;
const skipLarge = process.argv.includes("--skip-large");

const cases = [
  {
    name: "FeatureCollection, 1 MB",
    make: (file) => writeCollection(file, MEGABYTE),
  },
  {
    name: "FeatureCollection, 50 MB",
    make: (file) => writeCollection(file, 50 * MEGABYTE),
  },
  ...(skipLarge
    ? []
    : [
        {
          name: "FeatureCollection, 500 MB",
          make: (file) => writeCollection(file, 500 * MEGABYTE),
        },
      ]),
  {
    name: "One polygon, 1,000,000 vertices",
    make: (file) => writePolygon(file, POLYGON_VERTICES),
  },
];

function lintInFreshProcess(file) {
  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, "case.mjs"), file],
    {
      encoding: "utf8",
      maxBuffer: 16 * MEGABYTE,
    },
  );
  if (result.status !== 0) {
    throw new Error(`Benchmark case failed:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

const directory = mkdtempSync(path.join(os.tmpdir(), "geolint-bench-"));
const rows = [];
try {
  for (const entry of cases) {
    const file = path.join(directory, "input.geojson");
    await entry.make(file);
    const megabytes = statSync(file).size / MEGABYTE;
    const run = lintInFreshProcess(file);
    rows.push({
      name: entry.name,
      size: `${megabytes.toFixed(1)} MB`,
      seconds: (run.milliseconds / 1000).toFixed(2),
      speed: `${(megabytes / (run.milliseconds / 1000)).toFixed(1)} MB/s`,
      memory: `${run.peakResidentMegabytes.toFixed(0)} MB`,
      features: run.features,
      findings: run.findings,
    });
    rmSync(file);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

const cpu = os.cpus()[0];
const lines = [
  `Machine: ${cpu?.model.trim()} (${os.cpus().length} logical processors), ${(os.totalmem() / 1024 ** 3).toFixed(0)} GB memory, ${os.type()} ${os.release()}, Node ${process.version}`,
  "",
  "| Input | Size | Time | Speed | Peak memory | Features | Findings |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.name} | ${row.size} | ${row.seconds} s | ${row.speed} | ${row.memory} | ${row.features} | ${row.findings} |`,
  ),
];
process.stdout.write(`${lines.join("\n")}\n`);
