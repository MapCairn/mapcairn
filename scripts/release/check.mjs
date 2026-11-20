// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The release readiness report: where the four SDK packages stand, in plain
 * English, and the next step for a person. It reads only public data (`git`,
 * `npm pack --dry-run`, `npm view`, `npm whoami`) and changes nothing.
 *
 *   npm run release:check
 *
 * The report goes in the Release pull request's description. It names no
 * command the maintainer runs for npm: `docs/guides/releasing.md` has them,
 * and a committed script may not hold such a command (`publishGuard.mjs`).
 *
 * Exit codes: 0 no blocker (warnings and "nothing prepared" included), 1 a
 * blocker, 2 the report could not be built.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { extractNotes } from "./changelog.mjs";
import {
  checkChangelog,
  isShallowClone,
  subjectsSincePreviousTag,
} from "./notesCheck.mjs";
import { runNpm } from "./npm.mjs";
import { packResults } from "./packCheck.mjs";
import { git } from "./tools.mjs";
import {
  readSdkState,
  readWorkspaceManifests,
  SDK_NAMES,
} from "./workspaces.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** The version the packages carry until a release is prepared. */
export const UNRELEASED_VERSION = "0.0.0";

const GUIDE = "docs/guides/releasing.md";
const BYTES_PER_KB = 1000;

/**
 * @typedef {object} RegistryAnswer
 * @property {boolean} exists
 * @property {string} [latest] The newest version the registry resolves.
 * @property {boolean} [provenance] Whether that version carries an attestation.
 */

/**
 * @typedef {object} Facts
 * @property {{ versions: Record<string, string>, consistent: boolean, version: string | null, rangeProblems: string[] }} sdk
 * @property {string[]} privatePackages The SDK packages whose manifest sets `private`.
 * @property {{ hasSection: boolean, findings: string[] }} changelog
 * @property {string[]} tags The release tags, such as `v0.1.0-rc.1`.
 * @property {Array<{ name: string, files: number, size: number, problems: string[] }> | null} tarballs Null when they were not checked.
 * @property {Record<string, RegistryAnswer> | null} registry Null when the registry could not be read.
 * @property {boolean} signedIn Whether `npm whoami` succeeds here.
 * @property {boolean} tokenInEnvironment Whether an npm token variable is set.
 */

/** @param {string} name */
function short(name) {
  return name.replace("@mapcairn/", "");
}

/** @param {number} bytes */
function kilobytes(bytes) {
  return `${Math.round(bytes / BYTES_PER_KB)} kB`;
}

/**
 * Builds the report from facts that have already been read.
 *
 * @param {Facts} facts
 * @returns {{ lines: string[], blockers: string[], warnings: string[] }}
 */
export function buildReport(facts) {
  const { sdk } = facts;
  const prepared = sdk.consistent && sdk.version !== UNRELEASED_VERSION;
  /** @type {string[]} */
  const blockers = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const lines = [];

  /**
   * @param {string} label
   * @param {string} text
   */
  const line = (label, text) => lines.push(`  ${label}: ${text}`);
  /**
   * A line that is also a blocker.
   *
   * @param {string} label
   * @param {string} text
   */
  const blocker = (label, text) => {
    line(label, text);
    blockers.push(`${label}: ${text}`);
  };

  if (!sdk.consistent) {
    lines.push("Release readiness");
  } else if (!prepared) {
    lines.push(
      `Release readiness: nothing is prepared (the packages are at ${UNRELEASED_VERSION}, which means unreleased)`,
    );
  } else {
    lines.push(`Release readiness for v${sdk.version}`);
  }

  versionLines({ sdk, line, blocker });
  privateLines({ facts, prepared, line, blocker });
  if (prepared) {
    notesLines({ facts, line, blocker });
    tagLines({ facts, line, blocker });
    tarballLines({ facts, line, blocker });
  }
  const registry = registryLines({ facts, line, blocker });
  lines.push(...credentialLines({ facts, warnings }));
  line(
    "Trusted publishing",
    `cannot be read without signing in; the maintainer checks it as ${GUIDE} describes`,
  );
  line("Left for you", leftForYou({ blockers, prepared, registry }));
  return { lines, blockers, warnings };
}

/**
 * @param {object} input
 * @param {Facts["sdk"]} input.sdk
 * @param {(label: string, text: string) => void} input.line
 * @param {(label: string, text: string) => void} input.blocker
 */
function versionLines({ sdk, line, blocker }) {
  if (!sdk.consistent) {
    const found = Object.entries(sdk.versions)
      .map(([name, version]) => `${short(name)} ${version}`)
      .join(", ");
    blocker(
      "Versions",
      `the four SDK packages do not share one version (${found}). \`npm run release:apply\` sets all four together.`,
    );
    return;
  }
  if (sdk.rangeProblems.length > 0) {
    blocker(
      "Versions",
      `all four are ${sdk.version}, but an internal range does not match: ${sdk.rangeProblems.join("; ")}`,
    );
    return;
  }
  line(
    "Versions",
    `core, map, react and theme are all ${sdk.version}; internal ranges match.`,
  );
}

/**
 * @param {object} input
 * @param {Facts} input.facts
 * @param {boolean} input.prepared
 * @param {(label: string, text: string) => void} input.line
 * @param {(label: string, text: string) => void} input.blocker
 */
function privateLines({ facts, prepared, line, blocker }) {
  const names = facts.privatePackages.map(short).join(", ");
  if (facts.privatePackages.length === 0) {
    line("Private flags", "none of the four packages is private.");
    return;
  }
  if (prepared) {
    blocker(
      "Private flags",
      `${names} still private. npm skips a private package, so nothing would publish. The rc.1 Release pull request removes \`private\` and changes each package README's Status line in the same pull request.`,
    );
    return;
  }
  line(
    "Private flags",
    `${names} private, as expected until the rc.1 Release pull request removes it (with each package README's Status line).`,
  );
}

/**
 * @param {object} input
 * @param {Facts} input.facts
 * @param {(label: string, text: string) => void} input.line
 * @param {(label: string, text: string) => void} input.blocker
 */
function notesLines({ facts, line, blocker }) {
  const version = facts.sdk.version;
  if (!facts.changelog.hasSection) {
    blocker("Notes", `CHANGELOG.md has no section for ${version}.`);
    return;
  }
  if (facts.changelog.findings.length > 0) {
    blocker(
      "Notes",
      `CHANGELOG.md fails the notes check: ${facts.changelog.findings.join("; ")}`,
    );
    return;
  }
  line(
    "Notes",
    `CHANGELOG.md has a section for ${version} and passes the notes check.`,
  );
}

/**
 * @param {object} input
 * @param {Facts} input.facts
 * @param {(label: string, text: string) => void} input.line
 * @param {(label: string, text: string) => void} input.blocker
 */
function tagLines({ facts, line, blocker }) {
  const tag = `v${facts.sdk.version}`;
  if (facts.tags.includes(tag)) {
    blocker(
      "Tag",
      `${tag} is already tagged, so this version is already released. The next release needs a new version.`,
    );
    return;
  }
  line("Tag", `${tag} is not tagged yet.`);
}

/**
 * @param {object} input
 * @param {Facts} input.facts
 * @param {(label: string, text: string) => void} input.line
 * @param {(label: string, text: string) => void} input.blocker
 */
function tarballLines({ facts, line, blocker }) {
  if (facts.tarballs === null) {
    line("Tarballs", "not checked.");
    return;
  }
  const problems = facts.tarballs.flatMap((entry) =>
    entry.problems.map((problem) => `${entry.name}: ${problem}`),
  );
  if (problems.length > 0) {
    blocker("Tarballs", problems.join("; "));
    return;
  }
  const sizes = facts.tarballs
    .map((entry) => `${short(entry.name)} ${kilobytes(entry.size)}`)
    .join(", ");
  line(
    "Tarballs",
    `${facts.tarballs.length} packed, contents as expected (${sizes}).`,
  );
}

/**
 * @param {object} input
 * @param {Facts} input.facts
 * @param {(label: string, text: string) => void} input.line
 * @param {(label: string, text: string) => void} input.blocker
 * @returns {"unknown" | "none" | "all"} What the registry holds.
 */
function registryLines({ facts, line, blocker }) {
  if (facts.registry === null) {
    line(
      "npm",
      "the registry could not be read (offline, or it did not answer).",
    );
    return "unknown";
  }
  const present = SDK_NAMES.filter((name) => facts.registry?.[name]?.exists);
  if (present.length === 0) {
    line(
      "npm",
      `none of the four packages is on npm yet, so the first upload is by hand (${GUIDE}, maintainer steps).`,
    );
    return "none";
  }
  if (present.length < SDK_NAMES.length) {
    blocker(
      "npm",
      `only ${present.join(", ")} ${present.length === 1 ? "is" : "are"} on npm. The four are published together, so look into this before releasing.`,
    );
    return "unknown";
  }
  const latest = SDK_NAMES.map((name) => {
    const answer = facts.registry?.[name];
    const provenance =
      answer?.provenance === true ? "with provenance" : "no provenance";
    return `${short(name)} ${answer?.latest ?? "unknown"} (${provenance})`;
  }).join(", ");
  line("npm", `all four packages exist; latest: ${latest}.`);
  return "all";
}

/**
 * @param {object} input
 * @param {Facts} input.facts
 * @param {string[]} input.warnings Receives each warning.
 * @returns {string[]} The report lines for the warnings.
 */
function credentialLines({ facts, warnings }) {
  /** @type {string[]} */
  const before = [];
  const advice = `An agent should hold no registry credential (plan 0014, "Keeping agents from publishing"); ${GUIDE} says how to remove it.`;
  if (facts.signedIn) {
    const text = `npm is signed in on this machine. ${advice}`;
    warnings.push(text);
    before.push(`  Warning: ${text}`);
  }
  if (facts.tokenInEnvironment) {
    const text = `a registry token is set in the environment. ${advice}`;
    warnings.push(text);
    before.push(`  Warning: ${text}`);
  }
  return before;
}

/**
 * @param {object} input
 * @param {string[]} input.blockers
 * @param {boolean} input.prepared
 * @param {"unknown" | "none" | "all"} input.registry
 * @returns {string}
 */
function leftForYou({ blockers, prepared, registry }) {
  if (blockers.length > 0) {
    return "Fix the problems above first.";
  }
  if (!prepared) {
    return "nothing yet. An agent runs the release skill: plan, notes, apply, then opens the Release pull request.";
  }
  if (registry === "none") {
    return "merge the Release pull request, then publish the four tarballs from the GitHub Release by hand, because none is on npm yet.";
  }
  if (registry === "all") {
    return "merge the Release pull request, then approve the staged packages on npmjs.com.";
  }
  return "merge the Release pull request, then check on npmjs.com what was staged.";
}

/**
 * Reads what `npm view <name> --json` says about one package.
 *
 * @param {{ status: number | null, stdout: string, stderr: string }} result
 * @returns {RegistryAnswer | null} Null when the registry did not give a usable answer.
 */
export function parseRegistryAnswer(result) {
  if (result.status !== 0) {
    return /E404|404 Not Found/.test(result.stderr) ? { exists: false } : null;
  }
  try {
    const data = JSON.parse(result.stdout);
    return {
      exists: true,
      latest: String(data.version),
      provenance: data.dist?.attestations !== undefined,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {string | null} version The shared version, null when the four differ.
 * @returns {Facts["changelog"]}
 */
function readChangelog(root, version) {
  const file = path.join(root, "CHANGELOG.md");
  if (!existsSync(file)) {
    return { hasSection: false, findings: [] };
  }
  const text = readFileSync(file, "utf8");
  const history = isShallowClone(root) === false;
  const findings = checkChangelog(text, {
    subjectsFor: history ? subjectsSincePreviousTag(root) : undefined,
  }).map((finding) => `CHANGELOG.md:${finding.line}: ${finding.message}`);
  return {
    hasSection: version !== null && extractNotes(text, version) !== null,
    findings,
  };
}

/**
 * @param {string} root
 * @returns {Facts}
 */
function readFacts(root) {
  const sdk = readSdkState(root);
  const manifests = readWorkspaceManifests(root);
  const privatePackages = manifests
    .filter(
      ({ manifest }) =>
        SDK_NAMES.includes(manifest.name) && manifest.private === true,
    )
    .map(({ manifest }) => String(manifest.name));
  const prepared = sdk.consistent && sdk.version !== UNRELEASED_VERSION;

  const answers = SDK_NAMES.map((name) => [
    name,
    parseRegistryAnswer(runNpm(["view", name, "--json"], { cwd: root })),
  ]);
  const registry = answers.some(([, answer]) => answer === null)
    ? null
    : Object.fromEntries(answers);

  return {
    sdk,
    privatePackages,
    changelog: readChangelog(root, sdk.version),
    tags: git(["tag", "--list", "v*"], root)
      .stdout.split(/\r?\n/)
      .filter(Boolean),
    tarballs: prepared ? packResults(root) : null,
    registry,
    signedIn: runNpm(["whoami"], { cwd: root }).status === 0,
    tokenInEnvironment: ["NPM_TOKEN", "NODE_AUTH_TOKEN"].some(
      (name) => (process.env[name] ?? "") !== "",
    ),
  };
}

if (isEntryPoint(import.meta.url)) {
  try {
    const { lines, blockers } = buildReport(readFacts(ROOT));
    console.log(lines.join("\n"));
    process.exitCode = blockers.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
