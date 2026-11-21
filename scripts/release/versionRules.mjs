// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { compareVersions, formatVersion, parseVersion } from "./semver.mjs";

/** A Conventional Commit subject: type, optional scope, optional `!`, description. */
const SUBJECT = /^([a-z]+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;
/** The pull request number a squash merge adds to the end of a subject. */
const PULL_REQUEST_TAIL = /\s*\(#(\d+)\)\s*$/;
/** A breaking-change footer in a commit body. */
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;

/**
 * @typedef {object} ParsedCommit
 * @property {string} subject The subject as written.
 * @property {string | null} type The Conventional Commit type, null when the subject has none.
 * @property {string | null} scope
 * @property {string} description The subject without type, scope and pull request tail.
 * @property {boolean} breaking A `!` in the subject or a breaking-change footer.
 * @property {number | null} pullRequest The number in the `(#n)` tail.
 */

/**
 * Reads what a release needs from a squash-merged commit.
 *
 * @param {string} subject
 * @param {string} body
 * @returns {ParsedCommit}
 */
export function parseCommit(subject, body) {
  const tail = PULL_REQUEST_TAIL.exec(subject);
  const withoutTail = subject.replace(PULL_REQUEST_TAIL, "");
  const match = SUBJECT.exec(withoutTail);
  return {
    subject,
    type: match === null ? null : match[1],
    scope: match?.[2] ?? null,
    description: match === null ? withoutTail : match[4],
    breaking: match?.[3] === "!" || BREAKING_FOOTER.test(body),
    pullRequest: tail === null ? null : Number(tail[1]),
  };
}

/** Commit types that ship a fix or an improvement, and so give a patch. */
const PATCH_TYPES = new Set(["fix", "perf"]);

/**
 * The size of change one commit asks for, under the plan's rules.
 *
 * Under `0.x` a breaking change gives a minor bump and `feat`, `fix` and
 * `perf` give a patch. From `1.0.0` the usual rules apply. Any other type
 * asks for nothing.
 *
 * @param {ParsedCommit} commit
 * @param {number} major The major number of the last release.
 * @returns {"major" | "minor" | "patch" | null}
 */
export function bumpFor(commit, major) {
  if (commit.breaking) {
    return major === 0 ? "minor" : "major";
  }
  if (commit.type === "feat") {
    return major === 0 ? "patch" : "minor";
  }
  if (commit.type !== null && PATCH_TYPES.has(commit.type)) {
    return "patch";
  }
  return null;
}

/** @type {Array<"major" | "minor" | "patch">} */
const BUMP_ORDER = ["patch", "minor", "major"];

/**
 * @param {import("./semver.mjs").Version} last
 * @param {"major" | "minor" | "patch"} bump
 * @returns {import("./semver.mjs").Version}
 */
function raised(last, bump) {
  const base = { preId: null, preNumber: null };
  if (bump === "major") {
    return { ...base, major: last.major + 1, minor: 0, patch: 0 };
  }
  if (bump === "minor") {
    return { ...base, major: last.major, minor: last.minor + 1, patch: 0 };
  }
  return {
    ...base,
    major: last.major,
    minor: last.minor,
    patch: last.patch + 1,
  };
}

/**
 * @param {import("./semver.mjs").Version} base
 * @param {string | null} pre
 * @param {number} counter
 * @returns {string}
 */
function withPre(base, pre, counter) {
  return pre === null
    ? formatVersion({ ...base, preId: null, preNumber: null })
    : formatVersion({ ...base, preId: pre, preNumber: counter });
}

/**
 * @typedef {object} NextVersion
 * @property {string | null} version Null when there is nothing to release.
 * @property {"first" | "prerelease" | "major" | "minor" | "patch" | "none"} bump
 * @property {string} reason One sentence, for the person who reads the plan.
 */

/**
 * Works out the next version.
 *
 * - No tag yet: `0.1.0`.
 * - The last tag is a prerelease `X.Y.Z-rc.N`: `X.Y.Z`, or `rc.N+1` with a
 *   prerelease identifier, whatever the commits are.
 * - Otherwise the biggest change the commits ask for, or nothing.
 *
 * @param {object} input
 * @param {import("./semver.mjs").Version | null} input.last The newest release tag.
 * @param {ParsedCommit[]} input.commits Commits that touch the SDK packages since the base: the last release tag that is not a prerelease, or for a later candidate (`pre` set, last tag a prerelease) the previous candidate.
 * @param {boolean} input.apiBreaking Whether the API reports show a likely breaking change.
 * @param {string | null} input.pre The prerelease identifier asked for.
 * @returns {NextVersion}
 */
export function nextVersion({ last, commits, apiBreaking, pre }) {
  if (last === null) {
    const first = { major: 0, minor: 1, patch: 0 };
    return {
      version: withPre(first, pre, 1),
      bump: "first",
      reason: "There is no release tag yet, so this is the first release.",
    };
  }
  if (last.preId !== null) {
    const counter = last.preId === pre ? (last.preNumber ?? 0) + 1 : 1;
    const version = withPre(last, pre, counter);
    return {
      version,
      bump: "prerelease",
      reason: prereleaseReason(last, pre, version),
    };
  }
  const asked = commits.flatMap((commit) => {
    const bump = bumpFor(commit, last.major);
    return bump === null ? [] : [bump];
  });
  if (apiBreaking) {
    asked.push(last.major === 0 ? "minor" : "major");
  }
  const biggest = BUMP_ORDER.findLast((bump) => asked.includes(bump));
  if (biggest === undefined) {
    return {
      version: null,
      bump: "none",
      reason:
        "No commit since the last release is a feature, a fix, a performance change or a breaking change, so there is nothing to release.",
    };
  }
  return {
    version: withPre(raised(last, biggest), pre, 1),
    bump: biggest,
    reason: reasonFor(biggest, last.major, apiBreaking, commits),
  };
}

/**
 * @param {"major" | "minor" | "patch"} bump
 * @param {number} major
 * @param {boolean} apiBreaking
 * @param {ParsedCommit[]} commits
 * @returns {string}
 */
function reasonFor(bump, major, apiBreaking, commits) {
  const breaking = commits.some((commit) => commit.breaking) || apiBreaking;
  if (breaking) {
    const source = commits.some((commit) => commit.breaking)
      ? "A commit is marked as breaking"
      : "The API reports show a likely breaking change";
    return major === 0
      ? `${source}, and the version is still 0.x, so this is a ${bump} bump.`
      : `${source}, so this is a ${bump} bump.`;
  }
  return bump === "minor"
    ? "A commit adds a feature, so this is a minor bump."
    : "The commits since the last release add features or fixes, so this is a patch bump.";
}

/**
 * @param {import("./semver.mjs").Version} last A prerelease.
 * @param {string | null} pre
 * @param {string} version The version chosen.
 * @returns {string}
 */
function prereleaseReason(last, pre, version) {
  if (pre === null) {
    return `The last tag is the prerelease ${formatVersion(last)}, so the next version is its release.`;
  }
  const reason = `The last tag is the prerelease ${formatVersion(last)}, so this is the next ${pre} of ${last.major}.${last.minor}.${last.patch}.`;
  const chosen = parseVersion(version);
  if (chosen === null || compareVersions(chosen, last) >= 0) {
    return reason;
  }
  return `${reason} Note: ${version} sorts before ${formatVersion(last)}, so \`release:apply\` refuses it. Use \`--pre ${last.preId}\` or none.`;
}
