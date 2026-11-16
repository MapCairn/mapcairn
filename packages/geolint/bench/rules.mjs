// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
/**
 * What each rule costs. Parses a 1 MB generated FeatureCollection once, then
 * times every rule on its features with tinybench, so a slow rule shows up by
 * name before anything is optimised. Run `npm run build` first.
 *
 *   npm run bench:rules
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Bench } from "tinybench";
import { writeCollection } from "./generate.mjs";

const MEGABYTE = 1024 * 1024;
const { rules } = await import(
  pathToFileURL(path.resolve(import.meta.dirname, "../dist/index.js")).href
);

const directory = mkdtempSync(path.join(os.tmpdir(), "geolint-rules-"));
try {
  const file = path.join(directory, "input.geojson");
  await writeCollection(file, MEGABYTE);
  const { features } = JSON.parse(readFileSync(file, "utf8"));
  const context = { regions: [], countries: undefined };

  const bench = new Bench({ time: 400, warmupTime: 100 });
  for (const rule of rules.filter((candidate) => !candidate.needsRegion)) {
    bench.add(rule.id, () => {
      for (const feature of features) {
        rule.check(feature, context);
      }
    });
  }
  await bench.run();

  const lines = [
    `${features.length} features (${MEGABYTE / 1024} KB of JSON), one pass over all of them for each rule`,
    "",
    "| Rule | Mean per pass | Per feature | Runs |",
    "| --- | --- | --- | --- |",
    ...bench.tasks.map((task) => {
      const mean = task.result.latency.mean;
      return `| ${task.name} | ${mean.toFixed(2)} ms | ${((mean * 1000) / features.length).toFixed(2)} µs | ${task.result.latency.samplesCount} |`;
    }),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
