// Proves the browser test seam is absent from a production build.
//
// Usage, from packages/web after `react-router build`:
//   node scripts/verifyNoTestSeam.mjs                   exits 1 if the seam is found
//   node scripts/verifyNoTestSeam.mjs --expect-present  exits 1 if the seam is missing (for the e2e build)
//
// `--root <dir>` searches <dir>/build/client and <dir>/build/server instead of
// this package, which is how its test runs it.
//
// It searches build/client and build/server for the marker string in
// src/composition/testSeam.ts and for the window property it reads.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootFlag = process.argv.indexOf("--root");
const root =
  rootFlag === -1
    ? join(dirname(fileURLToPath(import.meta.url)), "..")
    : (process.argv[rootFlag + 1] ?? ".");
const directories = ["build/client", "build/server"];
const needles = ["KARTA_TEST_SEAM_MARKER", "__KARTA_TEST_SERVICES__"];
const expectPresent = process.argv.includes("--expect-present");

function* walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

const missing = [];
const found = [];
let filesChecked = 0;
for (const directory of directories) {
  const absolute = join(root, directory);
  try {
    statSync(absolute);
  } catch {
    missing.push(directory);
    continue;
  }
  for (const file of walk(absolute)) {
    filesChecked += 1;
    const text = readFileSync(file, "utf8");
    for (const needle of needles) {
      if (text.includes(needle)) {
        found.push(`${relative(root, file)}: ${needle}`);
      }
    }
  }
}

if (missing.length > 0 || filesChecked === 0) {
  console.error(
    `Cannot verify: build output not found (${missing.join(", ") || "no files"}). Run the build first.`,
  );
  process.exit(2);
}

if (expectPresent) {
  if (found.length === 0) {
    console.error(
      `The test seam is missing from ${filesChecked} build files, but this build should keep it.`,
    );
    process.exit(1);
  }
  console.log(`The test seam is present, as expected:\n${found.join("\n")}`);
} else {
  if (found.length > 0) {
    console.error(`The test seam leaked into the build:\n${found.join("\n")}`);
    process.exit(1);
  }
  console.log(`The test seam is absent from ${filesChecked} build files.`);
}
