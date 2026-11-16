// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
/**
 * Lints one file in a fresh process and prints one line of JSON: the elapsed
 * time, the peak resident memory and the number of features and findings. A
 * process of its own gives a peak memory figure that belongs to this file alone.
 *
 *   node bench/case.mjs <file> [--rules a,b,c]
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const [file, flag, ruleList] = process.argv.slice(2);
if (!file) {
  throw new Error("Usage: node bench/case.mjs <file> [--rules a,b,c]");
}

const dist = pathToFileURL(
  path.resolve(import.meta.dirname, "../dist/index.js"),
);
const node = pathToFileURL(
  path.resolve(import.meta.dirname, "../dist/node/index.js"),
);
const { lintBytes, rules } = await import(dist.href);
const { fileChunks } = await import(node.href);

const only = flag === "--rules" ? new Set(ruleList.split(",")) : undefined;
const selected = only ? rules.filter((rule) => only.has(rule.id)) : rules;

const started = process.hrtime.bigint();
const report = await lintBytes(fileChunks(file), { rules: selected });
const milliseconds = Number(process.hrtime.bigint() - started) / 1e6;

process.stdout.write(
  `${JSON.stringify({
    milliseconds,
    peakResidentMegabytes: process.resourceUsage().maxRSS / 1024,
    features: report.featureCount,
    findings: report.findings.length,
    inputError: report.inputError?.message ?? null,
  })}\n`,
);
