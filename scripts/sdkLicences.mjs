// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Checks that every production dependency of the SDK packages allows
 * commercial use.
 *
 *   node scripts/sdkLicences.mjs
 *   node scripts/sdkLicences.mjs --root <dir>   read a different checkout (the tests do)
 *
 * The SDK packages (every name in `scripts/sdkPackages.mjs`) must not carry anything
 * that needs a licence agreement of its own. This walks the production
 * dependencies of those packages, direct and transitive, through
 * `package-lock.json`, and fails when a package's licence is not on the
 * reviewed list in `scripts/sdkLicences.allowlist.json`. It reads two kinds of
 * file in the checkout and makes no network request: each SDK package's
 * `package.json` (its own dependency lists) and the lockfile (the resolved tree
 * and each package's licence).
 *
 * What is checked, and what is not:
 * - `dependencies`, `optionalDependencies` and, for every package that is not
 *   an SDK package, its required `peerDependencies` that the lockfile holds
 *   (npm installs them, so they ship), followed down the whole tree, fail when
 *   the licence is not allowed. An optional dependency that the
 *   lockfile does not hold (it is for another platform) is skipped.
 * - `peerDependencies` and `devDependencies` of an SDK package are listed and
 *   never fail: a peer is the host's own choice, and a dev dependency is not
 *   shipped. The exception is an SDK package that another SDK package depends
 *   on (the MapLibre adapter, which the umbrella depends on): npm installs its
 *   required peers for every app that installs the package that needs it, so
 *   its required peers, and their trees, are judged like dependencies. Its
 *   optional peers are still only listed.
 * - `packages/web` and `examples/embed` are not held to the rule. The host
 *   and the example may use other licences. The output says so.
 * - The SDK packages themselves are workspace links in the lockfile. They are
 *   followed but not judged, because their licence is the repository's. A link
 *   from one SDK package to another is followed into the other's required
 *   peers, as above.
 *
 * The allowlist file has two parts. `licences` is the permissive base list of
 * SPDX identifiers, each with a note. `packages` allows one package under a licence that is not
 * on the base list, with the reason, and only for that exact licence, so a
 * change of licence in a later release fails again. Weak copyleft (LGPL, MPL)
 * is not on the base list: it needs an explicit entry that the maintainer adds.
 *
 * SPDX expressions are evaluated, not matched as text. `A OR B` passes when
 * either side is allowed, `A AND B` when both are, `AND` binds tighter than
 * `OR`, and brackets group. `X WITH exception` is judged as `X`: an exception
 * only widens what the licence permits. Identifiers compare without regard to
 * case. An expression that does not parse, such as `SEE LICENSE IN file`, is
 * not allowed. Exit codes: 0 clean, 1 a package failed or the files could not
 * be read.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "./entryPoint.mjs";
import { SDK_PACKAGES } from "./sdkPackages.mjs";

/** The workspace folders held to the rule, relative to the repository root. */
export const SDK_PACKAGE_PATHS = SDK_PACKAGES.map((name) => `packages/${name}`);
/** Workspaces the rule leaves out, named in the output. */
export const EXEMPT_PATHS = ["packages/web", "examples/embed"];
/** The file a person edits to allow a licence or a package, as written in messages. */
export const ALLOWLIST_FILE = "scripts/sdkLicences.allowlist.json";
/** What a package with no usable licence field is reported as. */
export const NO_LICENCE = "(none)";

const TOKEN = /\(|\)|[^\s()]+/g;

/**
 * Tokens of an SPDX licence expression.
 *
 * @param {string} expression
 * @returns {string[]}
 */
function tokenise(expression) {
  return expression.match(TOKEN) ?? [];
}

/**
 * Whether an SPDX licence expression is allowed, given the identifiers that
 * are. Anything that does not parse is not allowed.
 *
 * @param {string} expression For example `(MIT OR Apache-2.0)`.
 * @param {ReadonlySet<string>} allowed Lower-case identifiers.
 * @returns {boolean}
 */
export function isLicenceAllowed(expression, allowed) {
  const tokens = tokenise(expression);
  let position = 0;

  const peekOperator = () => tokens[position]?.toUpperCase();

  /** An identifier with an optional `WITH exception`, or a bracketed expression. */
  const parseAtom = () => {
    const token = tokens[position];
    if (token === undefined || token === ")") {
      throw new SyntaxError("expected a licence");
    }
    position += 1;
    if (token === "(") {
      const inner = parseOr();
      if (tokens[position] !== ")") {
        throw new SyntaxError("expected a closing bracket");
      }
      position += 1;
      return inner;
    }
    if (["AND", "OR", "WITH"].includes(token.toUpperCase())) {
      throw new SyntaxError("expected a licence");
    }
    if (peekOperator() === "WITH") {
      position += 1;
      if (tokens[position] === undefined) {
        throw new SyntaxError("expected an exception");
      }
      position += 1;
    }
    return allowed.has(token.toLowerCase());
  };

  const parseAnd = () => {
    let result = parseAtom();
    while (peekOperator() === "AND") {
      position += 1;
      const next = parseAtom();
      result = result && next;
    }
    return result;
  };

  function parseOr() {
    let result = parseAnd();
    while (peekOperator() === "OR") {
      position += 1;
      const next = parseAnd();
      result = result || next;
    }
    return result;
  }

  try {
    const result = parseOr();
    return position === tokens.length && result;
  } catch {
    return false;
  }
}

/**
 * The lockfile entry a dependency resolves to when required from a location,
 * found the way Node does: the location's own `node_modules`, then each parent's.
 *
 * @param {Record<string, any>} packages The lockfile's `packages` table.
 * @param {string} from Lockfile key of the requiring package (`""` is the root).
 * @param {string} name
 * @returns {string | undefined} The lockfile key, if any.
 */
function resolveKey(packages, from, name) {
  let base = from;
  for (;;) {
    const key =
      base === "" ? `node_modules/${name}` : `${base}/node_modules/${name}`;
    if (packages[key] !== undefined) {
      return key;
    }
    if (base === "") {
      return undefined;
    }
    const nested = base.lastIndexOf("/node_modules/");
    base = nested === -1 ? "" : base.slice(0, nested);
  }
}

/**
 * The licence text of a lockfile entry, or `NO_LICENCE` when it has none in a
 * form this check can read (an absent field, or the old object or array forms).
 *
 * @param {{ license?: unknown }} entry
 * @returns {string}
 */
function licenceOf(entry) {
  return typeof entry.license === "string" && entry.license.trim() !== ""
    ? entry.license.trim()
    : NO_LICENCE;
}

/**
 * @typedef {object} Failure
 * @property {string} name
 * @property {string} version
 * @property {string} licence
 * @property {string} requiredBy The SDK package that pulls it in.
 */

/**
 * @typedef {object} LicenceReport
 * @property {number} checked Production packages whose licence was judged.
 * @property {Failure[]} failures
 * @property {Record<string, string[]>} peers Peer dependency names that are not judged, by SDK package.
 * @property {Record<string, string[]>} judgedPeers Required peer names that are judged because another SDK package depends on the package, by SDK package.
 * @property {Record<string, string[]>} dev Dev dependency names, by SDK package.
 */

/**
 * Walks the production dependencies of the SDK packages and judges each
 * package's licence.
 *
 * @param {object} input
 * @param {{ packages: Record<string, any> }} input.lockfile Parsed `package-lock.json`.
 * @param {Record<string, any>} input.manifests Parsed `package.json` of each SDK package, by workspace path.
 * @param {{ licences: Record<string, string>, packages: Record<string, { licence: string, reason: string }> }} input.allowlist
 * @returns {LicenceReport}
 */
export function checkSdkLicences({ lockfile, manifests, allowlist }) {
  const { packages } = lockfile;
  const allowed = new Set(
    Object.keys(allowlist.licences).map((id) => id.toLowerCase()),
  );
  /** @type {Failure[]} */
  const failures = [];
  const peers = {};
  const judgedPeers = {};
  const dev = {};
  const seen = new Set();
  const absent = new Set();

  /** @param {string} key @param {string} requiredBy */
  const visit = (key, requiredBy) => {
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const entry = packages[key];
    if (entry.link) {
      const target = packages[entry.resolved];
      if (target === undefined) {
        return;
      }
      if (SDK_PACKAGE_PATHS.includes(entry.resolved)) {
        const label = target.name ?? entry.resolved;
        judgedPeers[label] = requiredPeers(target);
        walk(entry.resolved, target, label, true);
        return;
      }
      walk(entry.resolved, target, requiredBy, true);
      return;
    }
    const name =
      entry.name ??
      key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    const licence = licenceOf(entry);
    const exception = allowlist.packages[name];
    const permitted =
      isLicenceAllowed(licence, allowed) || exception?.licence === licence;
    if (!permitted) {
      failures.push({
        name,
        version: entry.version ?? "?",
        licence,
        requiredBy,
      });
    }
    walk(key, entry, requiredBy, true);
  };

  /**
   * The peers npm installs for `source`: every peer that is not optional.
   *
   * @param {Record<string, any>} source
   * @returns {string[]}
   */
  const requiredPeers = (source) => {
    const optionalPeers = Object.entries(source.peerDependenciesMeta ?? {})
      .filter(([, meta]) => meta?.optional)
      .map(([name]) => name);
    return Object.keys(source.peerDependencies ?? {}).filter(
      (name) => !optionalPeers.includes(name),
    );
  };

  /**
   * Visits what `source` needs. `followPeers` is false only for an SDK
   * package's own manifest, whose peers are the host's choice; for any other
   * package npm installs its required peers, so they ship and are judged.
   *
   * @param {string} from @param {Record<string, any>} source
   * @param {string} requiredBy @param {boolean} followPeers
   */
  const walk = (from, source, requiredBy, followPeers) => {
    const optional = Object.keys(source.optionalDependencies ?? {});
    const peerNames = followPeers ? requiredPeers(source) : [];
    const names = [
      ...Object.keys(source.dependencies ?? {}),
      ...optional,
      ...peerNames,
    ];
    for (const name of names) {
      const key = resolveKey(packages, from, name);
      if (key !== undefined) {
        visit(key, requiredBy);
      } else if (
        !optional.includes(name) &&
        !peerNames.includes(name) &&
        !absent.has(`${requiredBy}/${name}`)
      ) {
        absent.add(`${requiredBy}/${name}`);
        failures.push({
          name,
          version: "?",
          licence: "(not in package-lock.json)",
          requiredBy,
        });
      }
    }
  };

  for (const path of SDK_PACKAGE_PATHS) {
    const manifest = manifests[path];
    const label = manifest.name ?? path;
    peers[label] = Object.keys(manifest.peerDependencies ?? {});
    dev[label] = Object.keys(manifest.devDependencies ?? {});
    walk(path, manifest, label, false);
  }

  for (const [label, judged] of Object.entries(judgedPeers)) {
    peers[label] = (peers[label] ?? []).filter(
      (name) => !judged.includes(name),
    );
  }

  const checked = [...seen].filter((key) => !packages[key].link).length;
  return { checked, failures, peers, judgedPeers, dev };
}

/**
 * The message for one failing package: its name, its licence and the file to
 * edit.
 *
 * @param {Failure} failure
 * @returns {string}
 */
export function describeFailure({ name, version, licence, requiredBy }) {
  return `${name}@${version} (needed by ${requiredBy}) is licensed ${licence}, which is not on the allowlist. If it allows commercial use and carries no terms of its own, ask the maintainer to add it to "packages" in ${ALLOWLIST_FILE} with the reason; otherwise remove or replace the dependency.`;
}

/**
 * The lines the check prints.
 *
 * @param {LicenceReport} report
 * @returns {string[]}
 */
export function reportLines(report) {
  const lines = [
    `sdk licences: not checked, by design: ${EXEMPT_PATHS.join(", ")} (the host and the example may use other licences)`,
  ];
  for (const [label, names] of Object.entries(report.peers)) {
    if (names.length > 0) {
      lines.push(
        `sdk licences: ${label} peer dependencies, not checked: ${names.join(", ")}`,
      );
    }
  }
  for (const [label, names] of Object.entries(report.judgedPeers)) {
    if (names.length > 0) {
      lines.push(
        `sdk licences: ${label} required peer dependencies, checked because another SDK package depends on it: ${names.join(", ")}`,
      );
    }
  }
  for (const [label, names] of Object.entries(report.dev)) {
    if (names.length > 0) {
      lines.push(
        `sdk licences: ${label} dev dependencies, not shipped and not checked: ${names.length}`,
      );
    }
  }
  if (report.failures.length === 0) {
    lines.push(
      `sdk licences: ${report.checked} production dependencies of the SDK packages all allow commercial use`,
    );
  } else {
    lines.push(
      `sdk licences: ${report.failures.length} of ${report.checked} production dependencies fail`,
    );
    lines.push(...report.failures.map(describeFailure));
  }
  return lines;
}

/**
 * Reads the files from a checkout and runs the check.
 *
 * @param {string} root The repository root.
 * @returns {LicenceReport}
 */
export function checkCheckout(root) {
  const read = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
  const manifests = Object.fromEntries(
    SDK_PACKAGE_PATHS.map((path) => [path, read(`${path}/package.json`)]),
  );
  return checkSdkLicences({
    lockfile: read("package-lock.json"),
    manifests,
    allowlist: read(ALLOWLIST_FILE),
  });
}

/** Prints the report and sets the exit code. */
function main() {
  let report;
  try {
    const rootFlag = process.argv.indexOf("--root");
    if (rootFlag !== -1 && process.argv[rootFlag + 1] === undefined) {
      throw new Error("--root needs a directory");
    }
    const root =
      rootFlag === -1
        ? fileURLToPath(new URL("..", import.meta.url))
        : resolve(process.argv[rootFlag + 1]);
    report = checkCheckout(root);
  } catch (error) {
    console.error(`sdk licences: the check could not run: ${error.message}`);
    process.exit(1);
  }
  const lines = reportLines(report);
  if (report.failures.length > 0) {
    console.error(lines.join("\n"));
    process.exit(1);
  }
  console.log(lines.join("\n"));
}

if (isEntryPoint(import.meta.url)) {
  main();
}
