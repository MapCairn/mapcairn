// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The pure parts of the consumer check's peer legs (`checkPeers` and the
 * assertions in `checkUmbrella` in `consumerCheck.mjs`). `map` and the adapter
 * take `core`, `theme` (and `react` for `map`) as exact peers, so an app has one
 * copy of each. The umbrella install must show that one copy, and an app that
 * lists `core` at another version beside the adapter must be refused. Kept
 * apart so unit tests can cover them without an install.
 */

/** The packages the mismatch app lists besides the engine, by folder name. */
const MISMATCH_TARBALLS = ["adapter-maplibre", "theme"];

/** The engine the adapter requires as a peer. */
const ENGINE = "maplibre-gl";

/**
 * A version that no exact range on `version` accepts, for a copy of `core`
 * that stands beside the adapter at a version it does not allow.
 *
 * @param {string} version The release version.
 * @returns {string}
 */
export function otherVersion(version) {
  return `${version}-other.0`;
}

/**
 * The manifest of the stand-in for `core` at another version. Only the name
 * and version matter: npm refuses the install over the version before it
 * reads anything else.
 *
 * @param {string} version The release version.
 * @returns {{ name: string, version: string }}
 */
export function otherCoreManifest(version) {
  return { name: "@mapcairn/core", version: otherVersion(version) };
}

/**
 * The `package.json` of an app that lists the adapter and `core` at another
 * version. Nothing is overridden, because an override would make the versions
 * agree and hide the mismatch.
 *
 * @param {{ tarballs: Record<string, string>, versions: Record<string, string>, otherCore: string }} input
 *   `otherCore` is the `file:` range of the stand-in for `core`.
 * @returns {{ name: string, version: string, private: boolean, type: string, dependencies: Record<string, string>, overrides: undefined }}
 * @throws When the adapter or `theme` has no tarball, or the engine no version.
 */
export function mismatchManifest({ tarballs, versions, otherCore }) {
  const listed = {};
  for (const name of MISMATCH_TARBALLS) {
    if (tarballs[name] === undefined) {
      throw new Error(
        `There is no tarball for ${name}, so the app cannot list it.`,
      );
    }
    listed[`@mapcairn/${name}`] = `file:../tarballs/${tarballs[name]}`;
  }
  if (versions[ENGINE] === undefined) {
    throw new Error(`The root lockfile gives no version of ${ENGINE}.`);
  }
  return {
    name: "mapcairn-throwaway-consumer",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: {
      ...listed,
      "@mapcairn/core": otherCore,
      [ENGINE]: versions[ENGINE],
    },
    overrides: undefined,
  };
}

/**
 * What is wrong with the install of the mismatch app: it must fail, and the
 * failure must be npm's peer conflict, the adapter's exact range on `core` at
 * the release version. A conflict over the engine, or over another version,
 * proves nothing about that range.
 *
 * @param {{ status: number | null, stdout?: string, stderr?: string }} result The finished `npm install`.
 * @param {string} version The release version.
 * @returns {string[]} One line for each problem.
 */
export function peerMismatchProblems(result, version) {
  if (result.status === 0) {
    return [
      "npm installed core at another version beside the adapter, which is two copies of core with no message; the adapter's peer range on core should refuse it.",
    ];
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (!output.includes("ERESOLVE")) {
    return [
      `The install failed, but not with ERESOLVE, so it proves nothing about the peer range:\n${output}`,
    ];
  }
  const peerLine = `peer @mapcairn/core@"${version}" from @mapcairn/adapter-maplibre`;
  if (!output.includes(peerLine)) {
    return [
      `The install failed with ERESOLVE, but not over the adapter's peer range on core (expected \`${peerLine}\`):\n${output}`,
    ];
  }
  return [];
}

/**
 * Each MapCairn package that an install holds in more than one place.
 *
 * @param {Record<string, unknown>} packages The `packages` map of the app's `node_modules/.package-lock.json`.
 * @returns {string[]} One line for each package found twice.
 */
export function ownPackageCopies(packages) {
  /** @type {Map<string, string[]>} */
  const places = new Map();
  for (const key of Object.keys(packages)) {
    const match = /(?:^|\/)node_modules\/(@mapcairn\/[^/]+)$/.exec(key);
    if (match !== null) {
      places.set(match[1], [...(places.get(match[1]) ?? []), key]);
    }
  }
  return [...places]
    .filter(([, keys]) => keys.length > 1)
    .map(([name, keys]) => `${name} is installed twice: ${keys.join(", ")}`);
}

/**
 * What is wrong with an install that should leave one copy of each MapCairn
 * package: a message about a MapCairn package's peers in what npm printed, and
 * a MapCairn package `npm ls` reports as invalid or missing.
 *
 * @param {{ installOutput: string, listing: { problems?: string[] } }} input
 *   `listing` is the parsed output of `npm ls --all --json`.
 * @returns {string[]} One line for each problem.
 */
export function sharedCopyProblems({ installOutput, listing }) {
  const messages = installOutput
    .split("\n")
    .filter(
      (line) =>
        line.includes("@mapcairn/") && /peer|ERESOLVE|invalid/i.test(line),
    )
    .map(
      (line) =>
        `npm printed a peer message about a MapCairn package: ${line.trim()}`,
    );
  const reported = (listing.problems ?? [])
    .filter((line) => line.includes("@mapcairn/"))
    .map((line) => `npm ls reports a MapCairn package: ${line}`);
  return [...messages, ...reported];
}
