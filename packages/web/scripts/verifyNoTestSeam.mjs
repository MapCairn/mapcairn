// Proves the development-only code is absent from a production build: the
// browser test seam and the living style guide at /design.
//
// Usage, from packages/web after `react-router build`:
//   node scripts/verifyNoTestSeam.mjs                   exits 1 if any marker is found
//   node scripts/verifyNoTestSeam.mjs --expect-present  exits 1 unless every group is found (for the e2e build)
//
// `--root <dir>` searches <dir>/build/client and <dir>/build/server instead of
// this package, which is how its test runs it.
//
// It searches build/client and build/server for each group's strings:
// - test seam: the marker in src/composition/testSeam.ts and the window
//   property it reads;
// - design guide: the marker the style guide page renders
//   (src/designGuide/DesignGuide.tsx).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootFlag = process.argv.indexOf("--root");
const root =
  rootFlag === -1
    ? join(dirname(fileURLToPath(import.meta.url)), "..")
    : (process.argv[rootFlag + 1] ?? ".");
const directories = ["build/client", "build/server"];
const groups = [
  {
    name: "test seam",
    needles: ["MAPCAIRN_TEST_SEAM_MARKER", "__MAPCAIRN_TEST_SERVICES__"],
  },
  { name: "design guide", needles: ["MAPCAIRN_DESIGN_GUIDE_MARKER"] },
];
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
/** Matches per group name, as `file: needle` lines. */
const found = new Map(groups.map((group) => [group.name, []]));
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
    for (const group of groups) {
      for (const needle of group.needles) {
        if (text.includes(needle)) {
          found.get(group.name).push(`${relative(root, file)}: ${needle}`);
        }
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

const report = (names) =>
  names.map((name) => `${name}:\n  ${found.get(name).join("\n  ")}`).join("\n");

if (expectPresent) {
  const absent = groups
    .map((group) => group.name)
    .filter((name) => found.get(name).length === 0);
  if (absent.length > 0) {
    console.error(
      `Missing from ${filesChecked} build files, but this build should keep it: ${absent.join(", ")}.`,
    );
    process.exit(1);
  }
  console.log(
    `Present, as expected:\n${report(groups.map((group) => group.name))}`,
  );
} else {
  const leaked = groups
    .map((group) => group.name)
    .filter((name) => found.get(name).length > 0);
  if (leaked.length > 0) {
    console.error(`Leaked into the build:\n${report(leaked)}`);
    process.exit(1);
  }
  console.log(
    `The test seam and the design guide are absent from ${filesChecked} build files.`,
  );
}
