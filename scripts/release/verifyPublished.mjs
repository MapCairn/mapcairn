// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The post-release check: installs the published version of the four SDK
 * packages from the registry into a throwaway app outside the repository,
 * renders the chrome there, verifies the registry signatures and the
 * provenance attestations of what was installed with `npm audit signatures`,
 * and says for each package whether it was published with provenance.
 *
 *   npm run release:verify-published -- <version> [<tarball-folder>] [--no-provenance]
 *
 * A package without provenance fails the check, because the workflow publishes
 * through trusted publishing and npm then records provenance. `--no-provenance`
 * says the version was published another way (the hand-published `0.1.0-rc.1`
 * has none): a package without provenance is then reported and does not fail.
 *
 * With the folder of the release's downloaded tarballs (the one
 * `verifyRelease.mjs tarballs` checks), it also compares each package's
 * registry `dist.integrity` and `dist.shasum` with the digests of the attested
 * tarball in that folder, so a version uploaded by hand is shown to be the
 * attested bytes. Without the folder it says plainly that this was not
 * compared.
 *
 * It also downloads the published tarballs and runs `publint` and `attw` on
 * what the registry serves, with the same arguments as `npm run pack:check`.
 *
 * Run it after the workflow's `npm` job has published. It only
 * reads the registry. The four SDK packages are exempted from the repository's
 * three-day minimum release age for this install, because a version that was
 * published a moment ago would otherwise not install; third-party packages
 * keep the rule.
 *
 * It needs a network and Node. Through the consumer check it also starts one
 * static server on 127.0.0.1 and the repository's Chromium for the real-map
 * leg, which skips with a message where Chromium is not installed.
 */
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { parseRegistryAnswer } from "./check.mjs";
import { auditProblems, runConsumerCheck } from "./consumerCheck.mjs";
import { isNotFound, REGISTRY_READ_FLAGS, runNpm } from "./npm.mjs";
import { runPackTypes } from "./packTypes.mjs";
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
  "Usage: npm run release:verify-published -- <version> [<tarball-folder>] [--no-provenance], such as 0.1.0 or 0.1.0-rc.2 (no leading v). The folder holds the release's downloaded tarballs, so the registry's digests can be compared with them. --no-provenance is for a version that was published by hand.";

/**
 * @param {string[]} argv The arguments after the script name.
 * @returns {{ version: string, requireProvenance: boolean, folder?: string }} Provenance is required unless `--no-provenance` is given; `folder` is the optional folder of the release's tarballs.
 * @throws {Error} When the arguments are not a version, an optional folder and the optional flag.
 */
export function parsePublishedArguments(argv) {
  const requireProvenance = !argv.includes("--no-provenance");
  const rest = argv.filter((argument) => argument !== "--no-provenance");
  const [version, folder] = rest;
  if (
    rest.length < 1 ||
    rest.length > 2 ||
    parseVersion(version) === null ||
    (folder !== undefined && (folder === "" || folder.startsWith("-")))
  ) {
    throw new Error(USAGE);
  }
  return folder === undefined
    ? { version, requireProvenance }
    : { version, requireProvenance, folder };
}

/**
 * Reads the `dist` of one version from `npm view <name>@<version> dist --json`.
 *
 * @param {{ status: number | null, stdout: string, stderr: string }} result
 * @returns {{ exists: false } | { exists: true, integrity?: string, shasum?: string } | null} Null when the registry gave no usable answer. A missing field stays undefined, so the report can fail on it.
 */
export function parseRegistryDist(result) {
  if (result.status !== 0) {
    return isNotFound(result.stderr) ? { exists: false } : null;
  }
  try {
    const dist = JSON.parse(result.stdout);
    if (dist === null || typeof dist !== "object") {
      return null;
    }
    return {
      exists: true,
      integrity:
        typeof dist.integrity === "string" ? dist.integrity : undefined,
      shasum: typeof dist.shasum === "string" ? dist.shasum : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * The digests npm records for a tarball: `integrity` is the SHA-512 as a
 * Subresource Integrity string (`sha512-` and base64), `shasum` the SHA-1 in
 * lower-case hex.
 *
 * @param {string} file
 * @returns {{ integrity: string, shasum: string }}
 */
export function tarballDigests(file) {
  const bytes = readFileSync(file);
  return {
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    shasum: createHash("sha1").update(bytes).digest("hex"),
  };
}

/**
 * Compares, for each package, the registry's digests of the version with those
 * of the attested tarball from the release, whoever uploaded it.
 *
 * @param {object} input
 * @param {string} input.version
 * @param {string | undefined} input.folder The folder of the release's tarballs, undefined when none was given.
 * @param {Record<string, ReturnType<typeof parseRegistryDist>>} input.answers What the registry said about each package.
 * @param {string[]} input.files The names of the regular files in the folder; a symbolic link is not one.
 * @param {(file: string) => { integrity: string, shasum: string }} input.digestOf The digests of a file in the folder.
 * @returns {{ lines: string[], problems: string[] }}
 */
export function integrityReport({ version, folder, answers, files, digestOf }) {
  if (folder === undefined) {
    return {
      lines: [
        "The integrity of the registry bytes was not compared with the attested tarballs (no tarball folder was given). Add the folder of the release's tarballs to compare it.",
      ],
      problems: [],
    };
  }
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const problems = [];
  for (const name of SDK_NAMES) {
    const file = `mapcairn-${name.replace("@mapcairn/", "")}-${version}.tgz`;
    const answer = answers[name] ?? null;
    if (!files.includes(file)) {
      problems.push(
        `${name}: the attested tarball ${file} is not a regular file in ${folder}`,
      );
    } else if (answer === null) {
      problems.push(
        `${name}: the integrity could not be read from the registry`,
      );
    } else if (!answer.exists) {
      problems.push(`${name}@${version} is not on the registry`);
    } else if (answer.integrity === undefined || answer.shasum === undefined) {
      problems.push(
        `${name}: the registry gave no ${answer.integrity === undefined ? "integrity" : "shasum"} for ${version}, so it cannot be compared with the attested tarball`,
      );
    } else {
      const expected = digestOf(file);
      const sha512Hashes = answer.integrity
        .split(/\s+/)
        .filter((hash) => hash.startsWith("sha512-"));
      const sameIntegrity =
        sha512Hashes.length === 1 && sha512Hashes[0] === expected.integrity;
      if (sameIntegrity && answer.shasum === expected.shasum) {
        lines.push(
          `${name}: the registry's digests match the attested tarball (${expected.integrity})`,
        );
      } else {
        problems.push(
          `${name}: the registry's integrity ${answer.integrity} (shasum ${answer.shasum}) differs from the attested tarball's ${expected.integrity} (shasum ${expected.shasum}): the upload differs from the attested tarball`,
        );
      }
    }
  }
  return { lines, problems };
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
 * Reads where a package's expected tag and `latest` point, and which
 * versions it has, from three registry reads: `npm view <name>@<tag> version`
 * for each tag (npm resolves a tag as a version range), and
 * `npm view <name> versions --json`.
 *
 * @param {object} input
 * @param {string} input.expected The tag the release rules give the version.
 * @param {{ status: number | null, stdout: string, stderr: string }} input.expectedResult
 * @param {{ status: number | null, stdout: string, stderr: string }} input.latestResult
 * @param {{ status: number | null, stdout: string, stderr: string }} input.versionsResult
 * @returns {{ tags: Record<string, string>, versions: string[] } | null} Null when the registry gave no usable answer.
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
    versions: Array.isArray(versions)
      ? versions.map(String)
      : [String(versions)],
  };
}

/**
 * Checks that the version sits under the dist-tag the release rules gave it,
 * and that a prerelease did not take `latest` from an earlier stable version.
 * npm gives a package's first version `latest` whatever its tag (the
 * hand-published `0.1.0-rc.1` has it), so `latest` on the prerelease passes
 * when the package has no other version (the first-version rule) or no other
 * stable version (the no-stable-version rule), and the line says which rule
 * applied. It fails only when a stable version exists, since `latest` may have
 * been taken from it.
 *
 * @param {object} input
 * @param {string} input.version
 * @param {string} input.expected The tag `distTagFor` gives the version.
 * @param {Record<string, { tags: Record<string, string>, versions: string[] } | null>} input.answers What the registry said about each package, null where it gave no usable answer.
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
    } else {
      const others = answer.versions.filter((other) => other !== version);
      const stable = others.filter((other) => !other.includes("-"));
      if (others.length === 0) {
        lines.push(
          `${name}: latest is ${version}, which npm gave the package's first version (first-version rule)`,
        );
      } else if (stable.length === 0) {
        lines.push(
          `${name}: latest is ${version}, and no stable version exists, so latest cannot have been taken from one (no-stable-version rule; other versions: ${others.join(", ")})`,
        );
      } else {
        problems.push(
          `${name}: latest is ${version}, but a prerelease must not take latest from an earlier stable version (${stable.join(", ")})`,
        );
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

/**
 * Reads the registry's `dist` of each package and the tarballs in a folder,
 * and compares them. Only regular files count (a symbolic link is not
 * followed), and the registry is read only when a folder is given.
 *
 * @param {object} input
 * @param {string} input.version
 * @param {string | undefined} input.folder The folder of the release's tarballs, undefined when none was given.
 * @param {(args: string[]) => { status: number | null, stdout: string, stderr: string }} input.view Runs `npm view` with the arguments.
 * @param {(folder: string) => string[]} [input.readdir]
 * @param {(file: string) => { isFile(): boolean }} [input.lstat]
 * @param {(file: string) => { integrity: string, shasum: string }} [input.digest]
 * @returns {{ lines: string[], problems: string[] }}
 */
export function compareWithTarballs({
  version,
  folder,
  view,
  readdir = readdirSync,
  lstat = lstatSync,
  digest = tarballDigests,
}) {
  if (folder === undefined) {
    return integrityReport({
      version,
      folder,
      answers: {},
      files: [],
      digestOf: digest,
    });
  }
  const resolved = path.resolve(folder);
  return integrityReport({
    version,
    folder: resolved,
    answers: Object.fromEntries(
      SDK_NAMES.map((name) => [
        name,
        parseRegistryDist(view([`${name}@${version}`, "dist", "--json"])),
      ]),
    ),
    files: readdir(resolved).filter((file) =>
      lstat(path.join(resolved, file)).isFile(),
    ),
    digestOf: (file) => digest(path.join(resolved, file)),
  });
}

/**
 * Downloads each SDK package at a version from the registry into a folder.
 *
 * @param {string} version
 * @param {string} folder An existing folder.
 * @throws {Error} When npm cannot fetch a package.
 */
function downloadPublished(version, folder) {
  for (const name of SDK_NAMES) {
    const result = runNpm([
      "pack",
      `${name}@${version}`,
      "--ignore-scripts",
      "--pack-destination",
      folder,
      ...REGISTRY_READ_FLAGS,
    ]);
    if (result.status !== 0) {
      throw new Error(`npm pack ${name}@${version} failed:\n${result.stderr}`);
    }
  }
}

/**
 * Runs `publint` and `attw` on the tarballs the registry serves for a version.
 *
 * @param {object} input
 * @param {string} input.version
 * @param {(version: string, folder: string) => void} [input.download] Fetches the tarballs into a folder; replaced in tests.
 * @param {(folder: string) => string[]} [input.typeCheck] Runs both tools on a folder of tarballs; replaced in tests.
 * @returns {string[]} One entry for each failed run.
 */
export function publishedTypeProblems({
  version,
  download = downloadPublished,
  typeCheck = runPackTypes,
}) {
  const folder = mkdtempSync(path.join(tmpdir(), "mapcairn-published-"));
  try {
    download(version, folder);
    return typeCheck(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/**
 * Runs the install check. If it throws (a package is not on npm yet, say), the
 * integrity problems found before it are added to the error, so a mismatch is
 * not hidden behind the install failure.
 *
 * @param {string} version
 * @param {string[]} integrityProblems
 * @returns {string[]}
 */
function installLines(version, integrityProblems) {
  try {
    return runConsumerCheck({ published: version });
  } catch (error) {
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        ...integrityProblems,
      ].join("\n"),
    );
  }
}

if (isEntryPoint(import.meta.url)) {
  try {
    const { version, requireProvenance, folder } = parsePublishedArguments(
      process.argv.slice(2),
    );
    const view = (/** @type {string[]} */ args) =>
      runNpm(["view", ...args, ...REGISTRY_READ_FLAGS]);
    const integrity = compareWithTarballs({ version, folder, view });
    for (const line of installLines(version, integrity.problems)) {
      console.log(line);
    }
    const report = provenanceReport(readAnswers(version), requireProvenance);
    const expected = distTagFor(
      version,
      git(["tag", "--list", "v*"], ROOT).stdout.split(/\r?\n/).filter(Boolean),
    );
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
    for (const line of [...report.lines, ...tags.lines, ...integrity.lines]) {
      console.log(line);
    }
    const typeProblems = publishedTypeProblems({ version });
    if (typeProblems.length === 0) {
      console.log("ok   publint and attw: no problem in any published tarball");
    }
    const problems = [
      ...report.problems,
      ...tags.problems,
      ...integrity.problems,
      ...typeProblems,
    ];
    if (problems.length > 0) {
      throw new Error(problems.join("\n"));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
