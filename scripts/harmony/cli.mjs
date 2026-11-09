/**
 * Command line entry for the harmony scanner. Run through
 * `npm run lint:harmony`.
 *
 * Usage: `node scripts/harmony/cli.mjs [--ignore-legacy] [--json]`
 *
 * - `--ignore-legacy` skips every path in `scripts/harmony/legacyPaths.json`
 *   (except for the viewport rule). `npm run lint` passes it. Without the
 *   flag, legacy code is scanned too, which lists what the rebuild must fix
 *   or delete.
 * - `--json` prints the violations as JSON.
 *
 * Exit code 1 when there is a violation or an allow-list entry that no longer
 * matches anything.
 */
import { scanRepo } from "./scan.mjs";

const args = new Set(process.argv.slice(2));
const result = scanRepo({ ignoreLegacy: args.has("--ignore-legacy") });

if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  for (const v of result.violations) {
    process.stderr.write(`${v.file}:${v.line}  ${v.rule}  ${v.message}\n`);
  }
  for (const entry of result.unused) {
    process.stderr.write(
      `scripts/harmony/allowlist.mjs  unused-allowlist-entry  ${entry.rule} in ${entry.file} ("${entry.contains}") matches nothing. Remove it.\n`,
    );
  }
}

const failures = result.violations.length + result.unused.length;
if (failures > 0) {
  process.stderr.write(`harmony: ${failures} problem(s)\n`);
  process.exit(1);
}
process.stdout.write(
  `harmony: ${result.scanned} files scanned${args.has("--ignore-legacy") ? `, ${result.skippedLegacy} legacy files skipped` : ""}, no violations\n`,
);
