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
import { isEntryPoint } from "../entryPoint.mjs";
import { parseRegistryAnswer } from "./check.mjs";
import { auditProblems, runConsumerCheck } from "./consumerCheck.mjs";
import { REGISTRY_READ_FLAGS, runNpm } from "./npm.mjs";
import { parseVersion } from "./semver.mjs";
import { SDK_NAMES } from "./workspaces.mjs";

export { auditProblems };

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
    for (const line of report.lines) {
      console.log(line);
    }
    if (report.problems.length > 0) {
      throw new Error(report.problems.join("\n"));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
