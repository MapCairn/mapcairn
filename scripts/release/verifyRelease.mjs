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
import { runNpm } from "./npm.mjs";
import { isPrerelease, parseVersion } from "./semver.mjs";
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
const RELEASE_SUBJECT =
  /^chore\(release\): v(\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?) \(#(\d+)\)$/;

/** The modes a dispatched run takes. */
const MODES = ["rehearse", "publish-existing"];

/** An error for a dispatched run that must not go on. */
export class ReleaseRefused extends Error {}

/**
 * @typedef {object} Decision
 * @property {boolean} release Whether the later jobs have work.
 * @property {string | null} version
 * @property {boolean} prerelease
 * @property {string} reason One sentence for the run's log.
 */

/**
 * @param {string} reason
 * @returns {Decision}
 */
function skip(reason) {
  return { release: false, version: null, prerelease: false, reason };
}

/**
 * @param {string} version
 * @param {string} reason
 * @returns {Decision}
 */
function proceed(version, reason) {
  const parsed = parseVersion(version);
  return {
    release: true,
    version,
    prerelease: parsed !== null && isPrerelease(parsed),
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
 * @param {(tag: string) => boolean} sources.tagExists
 * @param {(number: number) => { merged: boolean, base: string, mergeCommit: string | null, labels: string[] } | null} sources.pullRequest
 * @returns {Decision}
 */
export function decidePush(sources) {
  const subject = RELEASE_SUBJECT.exec(sources.headSubject());
  if (subject === null) {
    return skip(
      "the head commit's subject is not `chore(release): v<version> (#<number>)`, so this push is not a release",
    );
  }
  const [, version, numberText] = subject;
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
  if (sources.tagExists(tag)) {
    return skip(`the tag ${tag} already exists`);
  }

  const pullRequest = sources.pullRequest(number);
  if (pullRequest === null) {
    return skip(`pull request #${number} could not be read`);
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
 * @param {(tag: string) => boolean} input.tagExists
 * @returns {Decision}
 * @throws {ReleaseRefused}
 */
export function decideDispatch({ mode, version, manifestVersions, tagExists }) {
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
    if (!tagExists(`v${version}`)) {
      throw new ReleaseRefused(`There is no tag v${version} to publish from.`);
    }
    return proceed(
      version,
      `publishing the existing release v${version} to npm`,
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
  return proceed(version, `rehearsing ${version} on main`);
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
    if (/E404|404 Not Found/.test(result.stderr)) {
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
  const seen = new Set();
  for (const [file, manifest] of Object.entries(manifests)) {
    if (!SDK_NAMES.includes(manifest.name)) {
      problems.push(`${file} is not one of the four SDK packages`);
      continue;
    }
    seen.add(manifest.name);
    if (manifest.version !== version) {
      problems.push(
        `${file} holds ${manifest.name} ${manifest.version}, not ${version}`,
      );
    }
  }
  for (const name of SDK_NAMES.filter((entry) => !seen.has(entry))) {
    problems.push(`no tarball for ${name}`);
  }
  return problems;
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

/** @param {string} tag */
function tagExistsLocally(tag) {
  return git(["tag", "--list", tag], ROOT).stdout.trim() === tag;
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
      tagExists: tagExistsLocally,
      pullRequest: readPullRequest,
    });
  } else if (EVENT_NAME === "workflow_dispatch") {
    decision = decideDispatch({
      mode: MODE,
      version: VERSION_INPUT,
      manifestVersions: () => versionsAt("HEAD"),
      tagExists: tagExistsLocally,
    });
  } else {
    throw new ReleaseRefused(`The event ${EVENT_NAME} does not release.`);
  }
  console.log(decision.reason);

  let onNpm = false;
  if (decision.release) {
    const state = readRegistryState((name) => {
      const result = runNpm(["view", name, "version"], { cwd: ROOT });
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
    "on-npm": String(onNpm),
    private: String(decision.release && privateAtHead().length > 0),
  });
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
    } else {
      console.error(
        "Usage: node scripts/release/verifyRelease.mjs decide | tarballs <version> <folder>",
      );
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
