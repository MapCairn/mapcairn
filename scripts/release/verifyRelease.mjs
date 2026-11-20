// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Decides, for the `verify` job of `.github/workflows/release.yml`, whether a
 * run has something to release, and whether the four packages are already on
 * npm. The rules live here and not in the workflow so they have tests, and so
 * nothing from a pull request or an input is ever pasted into a shell line.
 *
 *   node scripts/release/verifyRelease.mjs decide
 *   node scripts/release/verifyRelease.mjs tarballs <version> <folder>
 *
 * `decide` reads these environment variables: `EVENT_NAME` (`push` or
 * `workflow_dispatch`), `MODE` and `VERSION_INPUT` (the dispatch inputs),
 * `GITHUB_SHA`, `GITHUB_OUTPUT` (where the job outputs go) and `GH_TOKEN`
 * (to read the pull request). It writes the outputs `release`, `version`,
 * `prerelease` and `on-npm`.
 *
 * Exit codes: 0 decided (a push that is not a release is a green run that
 * skips the later jobs), 1 a dispatched run was refused or something could
 * not be read, 2 wrong usage.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { isNotFound, REGISTRY_READ_FLAGS, runNpm } from "./npm.mjs";
import {
  compareVersions,
  isPrerelease,
  parseVersion,
  releaseTags,
} from "./semver.mjs";
import { git, REPOSITORY, run } from "./tools.mjs";
import { SDK_NAMES } from "./workspaces.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** The manifests of the four SDK packages, which a release changes together. */
export const SDK_MANIFEST_FILES = SDK_NAMES.map(
  (name) => `packages/${name.replace("@mapcairn/", "")}/package.json`,
);

/** The subject of a Release pull request's squash commit. */
const RELEASE_SUBJECT = /^chore\(release\): v(\S+) \(#([1-9]\d{0,9})\)$/;

/** The modes a dispatched run takes. */
const MODES = ["rehearse", "publish-existing"];

/** An error for a dispatched run that must not go on. */
export class ReleaseRefused extends Error {}

/**
 * @typedef {object} Decision
 * @property {boolean} release Whether the later jobs have work.
 * @property {string | null} version
 * @property {boolean} prerelease
 * @property {string} distTag The npm dist-tag the version is staged under.
 * @property {string} reason One sentence for the run's log.
 */

/**
 * @param {string} reason
 * @returns {Decision}
 */
function skip(reason) {
  return {
    release: false,
    version: null,
    prerelease: false,
    distTag: "",
    reason,
  };
}

/**
 * The dist-tag a version is staged under: `next` for the newest prerelease,
 * `latest` for a release that is the newest, and `previous` for a version
 * that is older than one already tagged (a prerelease older than any tag, a
 * release older than a release), so an old version never takes `next` or
 * `latest` back.
 *
 * @param {string} version
 * @param {string[]} tagNames The existing `v*` tags.
 * @returns {string}
 */
export function distTagFor(version, tagNames) {
  const parsed = parseVersion(version);
  if (parsed === null) {
    return "next";
  }
  const newer = releaseTags(tagNames).filter(
    (entry) => compareVersions(entry.version, parsed) > 0,
  );
  if (isPrerelease(parsed)) {
    return newer.length > 0 ? "previous" : "next";
  }
  return newer.some((entry) => !isPrerelease(entry.version))
    ? "previous"
    : "latest";
}

/**
 * @param {string} version
 * @param {string} reason
 * @param {string[]} tagNames The existing `v*` tags.
 * @returns {Decision}
 */
function proceed(version, reason, tagNames) {
  const parsed = parseVersion(version);
  return {
    release: true,
    version,
    prerelease: parsed !== null && isPrerelease(parsed),
    distTag: distTagFor(version, tagNames),
    reason,
  };
}

/**
 * Decides whether a push to `main` is a release: the head commit must be a
 * Release pull request's squash commit. A push that is not a release returns
 * a reason and no work, so the run ends green and skips the later jobs.
 *
 * @param {object} sources What the run can read; a test supplies fakes.
 * @param {() => string} sources.headSubject The subject of the commit that was pushed.
 * @param {() => string} sources.headSha
 * @param {(ref: string) => Record<string, string | null>} sources.manifestVersions The version in each SDK manifest at `HEAD` or `HEAD^`, null where it cannot be read.
 * @param {() => string[]} sources.tags The names of the existing `v*` tags.
 * @param {(number: number) => { merged: boolean, base: string, mergeCommit: string | null, labels: string[] } | null} sources.pullRequest
 * @returns {Decision}
 * @throws {ReleaseRefused} When a push that looks like a release cannot be checked.
 */
export function decidePush(sources) {
  const subject = RELEASE_SUBJECT.exec(sources.headSubject());
  if (subject === null) {
    return skip(
      "the head commit's subject is not `chore(release): v<version> (#<number>)`, so this push is not a release",
    );
  }
  const [, version, numberText] = subject;
  const parsed = parseVersion(version);
  if (parsed === null) {
    return skip(
      `the subject's version ${JSON.stringify(version)} is not a version`,
    );
  }
  const number = Number(numberText);

  const after = sources.manifestVersions("HEAD");
  const before = sources.manifestVersions("HEAD^");
  const unchanged = SDK_MANIFEST_FILES.filter(
    (file) => after[file] !== version || before[file] === version,
  );
  if (unchanged.length > 0) {
    return skip(
      `the commit does not change the version to ${version} in ${unchanged.join(", ")}`,
    );
  }

  const tag = `v${version}`;
  const tagNames = sources.tags();
  if (tagNames.includes(tag)) {
    return skip(`the tag ${tag} already exists`);
  }
  const newer = releaseTags(tagNames)
    .filter((entry) => compareVersions(entry.version, parsed) > 0)
    .at(-1);
  if (newer !== undefined) {
    return skip(
      `${version} is not newer than ${newer.tag}, which is already tagged`,
    );
  }

  const pullRequest = sources.pullRequest(number);
  if (pullRequest === null) {
    throw new ReleaseRefused(
      `This push looks like a release, but pull request #${number} could not be read, so it is not skipped quietly. Re-run the failed job once GitHub answers.`,
    );
  }
  if (!pullRequest.merged || pullRequest.base !== "main") {
    return skip(`pull request #${number} was not merged into main`);
  }
  if (!pullRequest.labels.includes("release")) {
    return skip(`pull request #${number} does not carry the release label`);
  }
  if (pullRequest.mergeCommit !== sources.headSha()) {
    return skip(
      `pull request #${number} was not merged as the commit that was pushed`,
    );
  }
  return proceed(
    version,
    `pull request #${number} is a merged Release pull request for ${version}`,
    tagNames,
  );
}

/**
 * Decides a dispatched run. Someone asked for it, so a check that fails is an
 * error and not a skip.
 *
 * @param {object} input
 * @param {string} input.mode `rehearse` or `publish-existing`.
 * @param {string} input.version The `version` input.
 * @param {() => Record<string, string | null>} input.manifestVersions The version in each SDK manifest on the commit being run.
 * @param {() => string[]} input.tags The names of the existing `v*` tags.
 * @returns {Decision}
 * @throws {ReleaseRefused}
 */
export function decideDispatch({ mode, version, manifestVersions, tags }) {
  if (parseVersion(version) === null) {
    throw new ReleaseRefused(
      `${JSON.stringify(version)} is not a version such as 0.1.0 or 0.1.0-rc.1.`,
    );
  }
  if (!MODES.includes(mode)) {
    throw new ReleaseRefused(
      `The mode ${JSON.stringify(mode)} is not one of ${MODES.join(", ")}.`,
    );
  }
  if (mode === "publish-existing") {
    if (!tags().includes(`v${version}`)) {
      throw new ReleaseRefused(`There is no tag v${version} to publish from.`);
    }
    return proceed(
      version,
      `publishing the existing release v${version} to npm`,
      tags(),
    );
  }
  const found = manifestVersions();
  const different = SDK_MANIFEST_FILES.filter(
    (file) => found[file] !== version,
  );
  if (different.length > 0) {
    throw new ReleaseRefused(
      `A rehearsal of ${version} needs every SDK manifest on main to carry it; ${different.join(", ")} does not.`,
    );
  }
  return proceed(version, `rehearsing ${version} on main`, tags());
}

/**
 * Asks the registry whether each SDK package exists. A package the registry
 * says it does not have counts as missing; any other failure (a network error,
 * an outage) throws, so a first publish is never assumed from an error.
 *
 * @param {(name: string) => { status: number | null, stdout: string, stderr: string }} view Runs `npm view <name> version`.
 * @returns {{ onNpm: boolean, missing: string[] }}
 */
export function readRegistryState(view) {
  /** @type {string[]} */
  const missing = [];
  for (const name of SDK_NAMES) {
    const result = view(name);
    if (result.status === 0) {
      continue;
    }
    if (isNotFound(result.stderr)) {
      missing.push(name);
      continue;
    }
    throw new Error(
      `Could not ask the registry about ${name}:\n${result.stderr.trim()}`,
    );
  }
  return { onNpm: missing.length === 0, missing };
}

/**
 * The SDK manifests that set `private`, which npm refuses to publish. A
 * manifest that cannot be read counts as private.
 *
 * @param {Record<string, string | null>} texts Each manifest's text, null where it cannot be read.
 * @returns {string[]} The files.
 */
export function privateSdkManifests(texts) {
  return Object.entries(texts)
    .filter(([, text]) => {
      if (text === null) {
        return true;
      }
      try {
        return JSON.parse(text).private === true;
      } catch {
        return true;
      }
    })
    .map(([file]) => file);
}

/**
 * What is wrong with a set of tarballs for a release.
 *
 * @param {string} version
 * @param {Record<string, { name: string, version: string }>} manifests Each tarball's file name and its `package.json`.
 * @returns {string[]}
 */
export function tarballVersionProblems(version, manifests) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const [file, manifest] of Object.entries(manifests)) {
    if (!SDK_NAMES.includes(manifest.name)) {
      problems.push(`${file} is not one of the four SDK packages`);
      continue;
    }
    counts.set(manifest.name, (counts.get(manifest.name) ?? 0) + 1);
    const expected = `mapcairn-${manifest.name.replace("@mapcairn/", "")}-${version}.tgz`;
    if (file !== expected) {
      problems.push(`${file} should be named ${expected}`);
    }
    if (manifest.version !== version) {
      problems.push(
        `${file} holds ${manifest.name} ${manifest.version}, not ${version}`,
      );
    }
  }
  for (const [name, count] of counts) {
    if (count > 1) {
      problems.push(`more than one tarball for ${name}`);
    }
  }
  for (const name of SDK_NAMES.filter((entry) => !counts.has(entry))) {
    problems.push(`no tarball for ${name}`);
  }
  return problems;
}

/**
 * What the registry says about one version of one package, for the staging
 * loop: published (skip it), missing (stage it), or an error (stop).
 *
 * @param {{ status: number | null, stdout: string, stderr: string }} result The result of `npm view <name>@<version> version`.
 * @param {string} version
 * @returns {"published" | "missing"}
 * @throws {Error} On any other answer, with npm's error text.
 */
export function packageState(result, version) {
  if (result.status === 0) {
    const found = result.stdout.trim();
    if (found === version) {
      return "published";
    }
    throw new Error(
      `The registry answered ${JSON.stringify(found)} when asked for version ${version}.`,
    );
  }
  if (isNotFound(result.stderr)) {
    return "missing";
  }
  throw new Error(`Could not ask the registry:\n${result.stderr.trim()}`);
}

/**
 * The version of each SDK manifest at a git ref.
 *
 * @param {string} ref
 * @returns {Record<string, string | null>}
 */
function versionsAt(ref) {
  return Object.fromEntries(
    SDK_MANIFEST_FILES.map((file) => {
      const shown = git(["show", `${ref}:${file}`], ROOT);
      if (!shown.ok) {
        return [file, null];
      }
      try {
        return [file, String(JSON.parse(shown.stdout).version)];
      } catch {
        return [file, null];
      }
    }),
  );
}

/** @returns {string[]} The SDK manifests on the commit being run that set `private`. */
function privateAtHead() {
  return privateSdkManifests(
    Object.fromEntries(
      SDK_MANIFEST_FILES.map((file) => {
        const shown = git(["show", `HEAD:${file}`], ROOT);
        return [file, shown.ok ? shown.stdout : null];
      }),
    ),
  );
}

/** @returns {string[]} The names of the `v*` tags in this clone. */
function tagsLocally() {
  return git(["tag", "--list", "v*"], ROOT)
    .stdout.split(/\r?\n/)
    .filter(Boolean);
}

/**
 * @param {number} number
 * @returns {{ merged: boolean, base: string, mergeCommit: string | null, labels: string[] } | null}
 */
function readPullRequest(number) {
  const result = run(
    "gh",
    ["api", `repos/${REPOSITORY}/pulls/${number}`],
    ROOT,
  );
  if (!result.ok) {
    return null;
  }
  const data = JSON.parse(result.stdout);
  return {
    merged: data.merged === true,
    base: String(data.base?.ref ?? ""),
    mergeCommit: data.merge_commit_sha ?? null,
    labels: (data.labels ?? []).map((/** @type {{ name: string }} */ label) =>
      String(label.name),
    ),
  };
}

/**
 * Reads one tarball's `package.json` with the system `tar`.
 *
 * @param {string} file
 * @returns {{ name: string, version: string }}
 */
function readTarballManifest(file) {
  const result = spawnSync("tar", ["-xOzf", file, "package/package.json"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Could not read package.json from ${file}.`);
  }
  const manifest = JSON.parse(result.stdout);
  return { name: String(manifest.name), version: String(manifest.version) };
}

/**
 * Writes job outputs to the file GitHub Actions provides, or to the log when
 * the script is run by hand.
 *
 * @param {Record<string, string>} outputs
 */
function writeOutputs(outputs) {
  const lines = Object.entries(outputs).map(
    ([key, value]) => `${key}=${value}`,
  );
  const file = process.env.GITHUB_OUTPUT;
  if (file === undefined) {
    console.log(lines.join("\n"));
    return;
  }
  appendFileSync(file, `${lines.join("\n")}\n`);
}

/** Decides the run from the environment and writes the job outputs. */
function decideFromEnvironment() {
  const { EVENT_NAME, MODE = "", VERSION_INPUT = "" } = process.env;
  /** @type {Decision} */
  let decision;
  if (EVENT_NAME === "push") {
    decision = decidePush({
      headSubject: () =>
        git(["log", "-1", "--format=%s", "HEAD"], ROOT).stdout.trim(),
      headSha: () => git(["rev-parse", "HEAD"], ROOT).stdout.trim(),
      manifestVersions: versionsAt,
      tags: tagsLocally,
      pullRequest: readPullRequest,
    });
  } else if (EVENT_NAME === "workflow_dispatch") {
    decision = decideDispatch({
      mode: MODE,
      version: VERSION_INPUT,
      manifestVersions: () => versionsAt("HEAD"),
      tags: tagsLocally,
    });
  } else {
    throw new ReleaseRefused(`The event ${EVENT_NAME} does not release.`);
  }
  console.log(decision.reason);

  let onNpm = false;
  if (decision.release) {
    const state = readRegistryState((name) => {
      const result = runNpm(["view", name, "version", ...REGISTRY_READ_FLAGS], {
        cwd: ROOT,
      });
      return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    });
    onNpm = state.onNpm;
    if (!onNpm) {
      console.log(
        `::notice::${state.missing.join(", ")} ${state.missing.length === 1 ? "is" : "are"} not on npm yet, so the npm job stages nothing unless this is a rehearsal. The first upload is by hand (docs/guides/releasing.md).`,
      );
    }
  }
  writeOutputs({
    release: String(decision.release),
    version: decision.version ?? "",
    prerelease: String(decision.prerelease),
    "dist-tag": decision.distTag,
    "on-npm": String(onNpm),
    private: String(decision.release && privateAtHead().length > 0),
  });
}

/**
 * Prints `published` or `missing` for one package version, and fails on
 * any other answer, so the staging loop never treats an error as "not there".
 *
 * @param {string} name An SDK package name.
 * @param {string} version
 */
function printPackageState(name, version) {
  if (!SDK_NAMES.includes(name)) {
    throw new ReleaseRefused(`${JSON.stringify(name)} is not an SDK package.`);
  }
  if (parseVersion(version) === null) {
    throw new ReleaseRefused(`${JSON.stringify(version)} is not a version.`);
  }
  const result = runNpm(
    ["view", `${name}@${version}`, "version", ...REGISTRY_READ_FLAGS],
    { cwd: ROOT },
  );
  console.log(
    packageState(
      {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      },
      version,
    ),
  );
}

/** Checks the tarballs in a folder against a version. */
function checkTarballs(version, folder) {
  if (parseVersion(version) === null) {
    throw new ReleaseRefused(`${JSON.stringify(version)} is not a version.`);
  }
  const manifests = Object.fromEntries(
    readdirSync(folder)
      .filter((file) => file.endsWith(".tgz"))
      .sort()
      .map((file) => [file, readTarballManifest(path.join(folder, file))]),
  );
  const problems = tarballVersionProblems(version, manifests);
  for (const problem of problems) {
    console.error(problem);
  }
  if (problems.length > 0) {
    throw new ReleaseRefused("The tarballs are not the release.");
  }
  console.log(`All four tarballs hold version ${version}.`);
}

if (isEntryPoint(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === "decide") {
      decideFromEnvironment();
    } else if (command === "tarballs" && rest.length === 2) {
      checkTarballs(rest[0], rest[1]);
    } else if (command === "package-state" && rest.length === 2) {
      printPackageState(rest[0], rest[1]);
    } else {
      console.error(
        "Usage: node scripts/release/verifyRelease.mjs decide | tarballs <version> <folder> | package-state <name> <version>",
      );
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
