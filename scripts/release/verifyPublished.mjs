// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The post-release check: installs the published version of the four SDK
 * packages from the registry into a throwaway app outside the repository,
 * renders the chrome there, and verifies the registry signatures and the
 * provenance attestations with `npm audit signatures`.
 *
 *   npm run release:verify-published -- <version>
 *
 * Run it after the maintainer has approved the staged packages. It only
 * reads the registry. The four SDK packages are exempted from the repository's
 * seven-day minimum release age for this install, because a version that was
 * published a moment ago would otherwise not install; third-party packages
 * keep the rule.
 *
 * It needs a network and Node, and starts no server.
 */
import { isEntryPoint } from "../entryPoint.mjs";
import { auditProblems, runConsumerCheck } from "./consumerCheck.mjs";
import { parseVersion } from "./semver.mjs";

export { auditProblems };

/**
 * @param {string[]} argv The arguments after the script name.
 * @returns {{ version: string }}
 * @throws {Error} When the arguments are not one version.
 */
export function parsePublishedArguments(argv) {
  const [version, ...rest] = argv;
  if (
    version === undefined ||
    rest.length > 0 ||
    parseVersion(version) === null
  ) {
    throw new Error(
      "Usage: npm run release:verify-published -- <version>, such as 0.1.0 or 0.1.0-rc.2 (no leading v).",
    );
  }
  return { version };
}

if (isEntryPoint(import.meta.url)) {
  try {
    const { version } = parsePublishedArguments(process.argv.slice(2));
    for (const line of runConsumerCheck({ published: version })) {
      console.log(line);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
