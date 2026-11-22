// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * A version as the release scripts read it: `1.2.3` or `1.2.3-rc.4`. A number
 * has no leading zero and at most nine digits, so none can overflow.
 */
const VERSION =
  /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([a-z]+)\.(0|[1-9]\d{0,8}))?$/;

/**
 * @typedef {object} Version
 * @property {number} major
 * @property {number} minor
 * @property {number} patch
 * @property {string | null} preId The prerelease identifier, such as `rc`.
 * @property {number | null} preNumber The prerelease counter.
 */

/**
 * Reads a version. Only the shapes this project releases are accepted: three
 * numbers, and optionally a lower-case word and a counter after a hyphen.
 *
 * @param {string} text
 * @returns {Version | null} Null for anything else, including a leading `v`.
 */
export function parseVersion(text) {
  const match = VERSION.exec(text);
  if (match === null) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    preId: match[4] ?? null,
    preNumber: match[5] === undefined ? null : Number(match[5]),
  };
}

/**
 * @param {Version} version
 * @returns {string}
 */
export function formatVersion(version) {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.preId === null
    ? base
    : `${base}-${version.preId}.${version.preNumber}`;
}

/**
 * Whether the version is a prerelease.
 *
 * @param {Version} version
 * @returns {boolean}
 */
export function isPrerelease(version) {
  return version.preId !== null;
}

/**
 * Orders two versions the way semver does: the numbers first, a prerelease
 * before its release, and prereleases by identifier and then counter. Git's
 * own tag sort puts `-rc` after the release unless it is configured, so the
 * scripts never rely on it.
 *
 * @param {Version} a
 * @param {Version} b
 * @returns {number} Negative when `a` is older, positive when it is newer.
 */
export function compareVersions(a, b) {
  const numbers = [
    a.major - b.major,
    a.minor - b.minor,
    a.patch - b.patch,
  ].find((difference) => difference !== 0);
  if (numbers !== undefined) {
    return numbers;
  }
  if (a.preId === null || b.preId === null) {
    return Number(a.preId === null) - Number(b.preId === null);
  }
  if (a.preId !== b.preId) {
    return a.preId < b.preId ? -1 : 1;
  }
  return (a.preNumber ?? 0) - (b.preNumber ?? 0);
}

/**
 * The range an internal dependency on a release takes: always the exact
 * version, for a release and a prerelease alike. `map` and
 * `adapter-maplibre` compile the theme's token names into their own CSS, and
 * those generated names may change in any release, so a package must only
 * ever meet the theme (and the other SDK packages) it was built with. A
 * prerelease needs it anyway, because `^0.1.0` does not match `0.1.0-rc.1`.
 *
 * @param {Version} version
 * @returns {string}
 */
export function internalRange(version) {
  return formatVersion(version);
}

/**
 * The release tags among a list of git tag names, as versions, oldest first.
 * A tag is `v` and a version; other tags are ignored.
 *
 * @param {string[]} names
 * @returns {Array<{ tag: string, version: Version }>}
 */
export function releaseTags(names) {
  return names
    .filter((name) => name.startsWith("v"))
    .flatMap((tag) => {
      const version = parseVersion(tag.slice(1));
      return version === null ? [] : [{ tag, version }];
    })
    .sort((a, b) => compareVersions(a.version, b.version));
}

/**
 * The newest tag that is older than a version, ignoring prereleases when the
 * version is a release: the notes of `0.2.0` cover everything since `0.1.0`,
 * however many candidates came between.
 *
 * @param {Array<{ tag: string, version: Version }>} tags Oldest first.
 * @param {Version} version
 * @returns {{ tag: string, version: Version } | null}
 */
export function previousTag(tags, version) {
  const older = tags.filter(
    (entry) =>
      compareVersions(entry.version, version) < 0 &&
      (isPrerelease(version) || !isPrerelease(entry.version)),
  );
  return older.at(-1) ?? null;
}
