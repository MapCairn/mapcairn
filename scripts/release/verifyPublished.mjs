// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The post-release check: installs the published version of the four SDK
 * packages from the registry into a throwaway app outside the repository,
 * renders the chrome there, verifies the registry signatures and the
 * provenance attestations of what was installed with `npm audit signatures`,
 * and says for each package whether it was published with provenance.
 *
 *   npm run release:verify-published -- <version> [--no-provenance]
 *
 * A package without provenance fails the check, because the workflow publishes
 * through trusted publishing and npm then records provenance. `--no-provenance`
 * says the version was published another way (the hand-published `0.1.0-rc.1`
 * has none): a package without provenance is then reported and does not fail.
 *
 * Run it after the workflow's `npm` job has published. It only
 * reads the registry. The four SDK packages are exempted from the repository's
 * seven-day minimum release age for this install, because a version that was
 * published a moment ago would otherwise not install; third-party packages
 * keep the rule.
 *
 * It needs a network and Node, and starts no server.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { parseRegistryAnswer } from "./check.mjs";
import { auditProblems, runConsumerCheck } from "./consumerCheck.mjs";
import { isNotFound, REGISTRY_READ_FLAGS, runNpm } from "./npm.mjs";
import { parseVersion } from "./semver.mjs";
import { git } from "./tools.mjs";
import { distTagFor } from "./verifyRelease.mjs";
import { SDK_NAMES } from "./workspaces.mjs";

export { auditProblems };

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const USAGE =
  "Usage: npm run release:verify-published -- <version> [--no-provenance], such as 0.1.0 or 0.1.0-rc.2 (no leading v). --no-provenance is for a version that was published by hand.";

/**
 * @param {string[]} argv The arguments after the script name.
 * @returns {{ version: string, requireProvenance: boolean }} Provenance is required unless `--no-provenance` is given.
 * @throws {Error} When the arguments are not one version and the optional flag.
 */
export function parsePublishedArguments(argv) {
  const requireProvenance = !argv.includes("--no-provenance");
  const rest = argv.filter((argument) => argument !== "--no-provenance");
  if (rest.length !== 1 || parseVersion(rest[0]) === null) {
    throw new Error(USAGE);
  }
  return { version: rest[0], requireProvenance };
}

/**
 * Says for each package whether the registry holds an attestation for the
 * published version.
 *
 * @param {Record<string, { exists: boolean, provenance?: boolean } | null>} answers What the registry said about each package, null where it gave no usable answer.
 * @param {boolean} requireProvenance Whether a package without provenance is a problem.
 * @returns {{ lines: string[], problems: string[] }}
 */
export function provenanceReport(answers, requireProvenance) {
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const problems = [];
  for (const name of SDK_NAMES) {
    const answer = answers[name] ?? null;
    if (answer === null) {
      problems.push(`${name} could not be read from the registry`);
    } else if (!answer.exists) {
      problems.push(`${name} is not on the registry`);
    } else if (answer.provenance === true) {
      lines.push(`${name}: published with provenance`);
    } else {
      lines.push(`${name}: no provenance`);
      if (requireProvenance) {
        problems.push(`${name} has no provenance, and it is required`);
      }
    }
  }
  return { lines, problems };
}

/**
 * Reads where a package's expected tag and `latest` point, and how many
 * versions it has, from three registry reads: `npm view <name>@<tag> version`
 * for each tag (npm resolves a tag as a version range), and
 * `npm view <name> versions --json`.
 *
 * @param {object} input
 * @param {string} input.expected The tag the release rules give the version.
 * @param {{ status: number | null, stdout: string, stderr: string }} input.expectedResult
 * @param {{ status: number | null, stdout: string, stderr: string }} input.latestResult
 * @param {{ status: number | null, stdout: string, stderr: string }} input.versionsResult
 * @returns {{ tags: Record<string, string>, versionCount: number } | null} Null when the registry gave no usable answer.
 */
export function parsePackageTags({
  expected,
  expectedResult,
  latestResult,
  versionsResult,
}) {
  /** @param {{ status: number | null, stdout: string, stderr: string }} result */
  const pointsAt = (result) => {
    if (result.status === 0) {
      return result.stdout.trim();
    }
    return isNotFound(result.stderr) ? "" : null;
  };
  const expectedVersion = pointsAt(expectedResult);
  const latestVersion = pointsAt(latestResult);
  if (expectedVersion === null || latestVersion === null) {
    return null;
  }
  if (versionsResult.status !== 0) {
    return null;
  }
  let versions;
  try {
    versions = JSON.parse(versionsResult.stdout);
  } catch {
    return null;
  }
  /** @type {Record<string, string>} */
  const tags = {};
  if (latestVersion !== "") {
    tags.latest = latestVersion;
  }
  if (expectedVersion !== "") {
    tags[expected] = expectedVersion;
  }
  return {
    tags,
    versionCount: Array.isArray(versions) ? versions.length : 1,
  };
}

/**
 * Checks that the version sits under the dist-tag the release rules gave it,
 * and that a prerelease did not take `latest` from an earlier version. A
 * package's first version gets `latest` from npm whatever its tag (the
 * hand-published `0.1.0-rc.1` has it), so `latest` is only reported for a
 * prerelease, and fails only when the prerelease took it over from an earlier
 * version.
 *
 * @param {object} input
 * @param {string} input.version
 * @param {string} input.expected The tag `distTagFor` gives the version.
 * @param {Record<string, { tags: Record<string, string>, versionCount: number } | null>} input.answers What the registry said about each package, null where it gave no usable answer.
 * @returns {{ lines: string[], problems: string[] }}
 */
export function distTagReport({ version, expected, answers }) {
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const problems = [];
  const prerelease = expected !== "latest" && version.includes("-");
  for (const name of SDK_NAMES) {
    const answer = answers[name] ?? null;
    if (answer === null) {
      problems.push(`${name}: the tags could not be read from the registry`);
      continue;
    }
    const actual = answer.tags[expected];
    if (actual === version) {
      lines.push(`${name}: ${expected} is ${version}`);
    } else {
      problems.push(
        `${name}: ${expected} is ${actual ?? "not set"}, not ${version}`,
      );
    }
    if (!prerelease) {
      continue;
    }
    const latest = answer.tags.latest;
    if (latest !== version) {
      lines.push(
        `${name}: latest is ${latest ?? "not set"} (not moved by this prerelease)`,
      );
    } else if (answer.versionCount <= 1) {
      lines.push(
        `${name}: latest is ${version}, which npm gave the package's first version`,
      );
    } else {
      problems.push(
        `${name}: latest is ${version}, but a prerelease must not take latest from an earlier version`,
      );
    }
  }
  return { lines, problems };
}

/**
 * Reads the registry's answer for each package at one version.
 *
 * @param {string} version
 */
function readAnswers(version) {
  return Object.fromEntries(
    SDK_NAMES.map((name) => [
      name,
      parseRegistryAnswer(
        runNpm([
          "view",
          `${name}@${version}`,
          "--json",
          ...REGISTRY_READ_FLAGS,
        ]),
      ),
    ]),
  );
}

if (isEntryPoint(import.meta.url)) {
  try {
    const { version, requireProvenance } = parsePublishedArguments(
      process.argv.slice(2),
    );
    for (const line of runConsumerCheck({ published: version })) {
      console.log(line);
    }
    const report = provenanceReport(readAnswers(version), requireProvenance);
    const expected = distTagFor(
      version,
      git(["tag", "--list", "v*"], ROOT).stdout.split(/\r?\n/).filter(Boolean),
    );
    const view = (/** @type {string[]} */ args) =>
      runNpm(["view", ...args, ...REGISTRY_READ_FLAGS]);
    const tags = distTagReport({
      version,
      expected,
      answers: Object.fromEntries(
        SDK_NAMES.map((name) => [
          name,
          parsePackageTags({
            expected,
            expectedResult: view([`${name}@${expected}`, "version"]),
            latestResult: view([`${name}@latest`, "version"]),
            versionsResult: view([name, "versions", "--json"]),
          }),
        ]),
      ),
    });
    for (const line of [...report.lines, ...tags.lines]) {
      console.log(line);
    }
    const problems = [...report.problems, ...tags.problems];
    if (problems.length > 0) {
      throw new Error(problems.join("\n"));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
