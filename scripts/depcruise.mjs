/**
 * Runs dependency-cruiser and fails if it found violations or if it cruised no
 * modules for a package. Without a TypeScript parser it reports success on zero
 * modules, which would silently switch the architecture rules off.
 */
import { spawnSync } from "node:child_process";

const packages = ["core", "map", "react", "theme", "web"];

const result = spawnSync(
  process.execPath,
  [
    "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
    ...packages.map((name) => `packages/${name}/src`),
    "--config",
    ".dependency-cruiser.cjs",
    "--output-type",
    "json",
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(`${result.stdout}\n${result.stderr}\n`);
  process.stderr.write("dependency-cruiser did not produce a report.\n");
  process.exit(1);
}

const errors = [];
for (const name of packages) {
  const count = report.modules.filter((module) =>
    module.source.startsWith(`packages/${name}/src`),
  ).length;
  if (count === 0) {
    errors.push(
      `No modules were cruised for packages/${name}. Check that a TypeScript parser (@swc/core) is installed.`,
    );
  }
}

for (const violation of report.summary.violations) {
  errors.push(
    `${violation.rule.name}: ${violation.from}${violation.to === violation.from ? "" : ` -> ${violation.to}`}`,
  );
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(
  `dependency-cruiser: ${report.summary.totalCruised} modules, ${report.summary.totalDependenciesCruised} dependencies, no violations\n`,
);
