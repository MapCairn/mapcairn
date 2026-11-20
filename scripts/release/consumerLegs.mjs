// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The settings and lookups for the consumer check's Worker, Yarn and Bun legs
 * (`consumerCheck.mjs`), kept apart so they can be tested without installing
 * anything.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * The conditions a Worker bundle resolves packages with: `workerd` first,
 * then the generic `worker` and `browser` ones. The SDK packages' own exports
 * have no such condition (only `@mapcairn/source`, `types` and `default`);
 * these conditions choose the third-party builds, such as the edge build of
 * `react-dom/server`, that a Worker takes instead of the Node ones.
 */
export const WORKER_CONDITIONS = ["workerd", "worker", "browser"];

/**
 * The Yarn Berry release the check runs, through corepack. It is exact, and
 * older than the repository's seven-day minimum release age.
 */
export const YARN_VERSION = "4.18.1";

/**
 * What corepack writes into `packageManager` for that version: the digest of
 * the Yarn release it downloads, so corepack refuses one that differs. The
 * value is the hash corepack itself computed on a download into an empty
 * `COREPACK_HOME` (its "Mismatch hashes" error names it when a wrong one is
 * pinned), not the registry's `dist.integrity` of the package, which digests
 * the archive and is a different value. A fresh download with this pin
 * succeeds and one with another digest fails.
 */
export const YARN_PACKAGE_MANAGER = `yarn@${YARN_VERSION}+sha512.b2e1e7524f654f2749d32b4ebcb4622473cb5bcbc485df2007e12a154e50162a4d795526768bc5f5b8f81717bfd79deb2472813d86fb5ae2eb551fa9c872b08f`;

/** The first Bun that reads `minimumReleaseAge`. */
export const BUN_MINIMUM_VERSION = "1.3.0";

/** How long a Yarn or Bun install may run before it is cut off, in ms. */
export const INSTALL_TIMEOUT = 5 * 60 * 1000;

/** How long the Worker run on workerd may take before it is cut off, in ms. */
export const WORKERD_TIMEOUT = 2 * 60 * 1000;

/** How long the browser leg may take before it is cut off, in ms. */
export const BROWSER_TIMEOUT = 3 * 60 * 1000;

/**
 * Where a Claude Code remote session preinstalls its Chromium. The reference
 * host's Playwright config (`packages/web/playwright.config.ts`) takes the
 * same file when it is there, because that session cannot download the
 * revision this repository's Playwright expects.
 */
export const REMOTE_SESSION_CHROMIUM = "/opt/pw-browsers/chromium";

/** Seven days, in the seconds Bun counts a release age in. */
export const BUN_MINIMUM_RELEASE_AGE = 7 * 24 * 60 * 60;

/**
 * Yarn's settings for the throwaway app: real `node_modules` (what most
 * projects use), no lifecycle scripts, no telemetry, a lockfile that may be
 * created (the app has none, and Yarn's hardened mode on a pull request
 * forbids that), and the same seven-day
 * minimum release age as the repository's `.npmrc`.
 *
 * @returns {string} The text of `.yarnrc.yml`.
 */
export function yarnSettings() {
  return [
    "nodeLinker: node-modules",
    "enableScripts: false",
    "enableImmutableInstalls: false",
    "enableHardenedMode: false",
    "enableTelemetry: false",
    'npmMinimalAgeGate: "7d"',
    "",
  ].join("\n");
}

/**
 * The manifest Yarn reads: Yarn ignores npm's `overrides` and takes
 * `resolutions`, so each SDK package resolves to its tarball, and corepack
 * reads the pinned `packageManager`.
 *
 * @param {{ overrides: Record<string, string> } & Record<string, unknown>} manifest
 *   The consumer manifest.
 * @returns {Record<string, unknown>}
 */
export function yarnManifest(manifest) {
  if (manifest.overrides === undefined) {
    throw new Error(
      "The Yarn manifest needs the tarball overrides to turn into resolutions.",
    );
  }
  return {
    ...manifest,
    resolutions: manifest.overrides,
    packageManager: YARN_PACKAGE_MANAGER,
  };
}

/**
 * Bun's settings for the throwaway app: the same seven-day minimum release
 * age as the repository's `.npmrc`, in Bun's own unit.
 *
 * @returns {string} The text of `bunfig.toml`.
 */
export function bunSettings() {
  return `[install]\nminimumReleaseAge = ${BUN_MINIMUM_RELEASE_AGE}\n`;
}

/**
 * The line for a skipped leg. On GitHub Actions it is a warning annotation,
 * so a runner without the tool shows up on the run's page.
 *
 * @param {string} message What was skipped and why.
 * @param {NodeJS.ProcessEnv} env The environment to read.
 */
function skipLine(message, env) {
  return env.GITHUB_ACTIONS === "true" ? `::warning::${message}` : message;
}

/**
 * The line for a skipped Yarn install. Yarn comes from corepack, which ships
 * with Node 24 and earlier and keeps one cache shared by every project on the
 * machine; nothing else is installed for it.
 *
 * @param {NodeJS.ProcessEnv} [env] The environment to read.
 * @returns {string}
 */
export function yarnSkipped(env = process.env) {
  return skipLine(
    "the Yarn install was skipped: corepack is missing or cannot download Yarn",
    env,
  );
}

/**
 * The line for a leg that does not run against the published packages: the
 * seven-day age these installs hold would refuse the packages just published.
 *
 * @param {string} tool The package manager.
 * @param {NodeJS.ProcessEnv} [env] The environment to read.
 * @returns {string}
 */
export function publishedSkipped(tool, env = process.env) {
  return skipLine(
    `the ${tool} install was skipped for the published packages: its seven-day release age would refuse a release made today`,
    env,
  );
}

/**
 * The skip line for a Yarn or Bun install when the check is run against a
 * published version, and nothing otherwise. Packed tarballs (`--tarballs` or
 * packed here) are `file:` installs, which the release age does not apply to.
 *
 * @param {string} tool The package manager.
 * @param {string | null} published The published version, or null.
 * @param {NodeJS.ProcessEnv} [env] The environment to read.
 * @returns {string | undefined}
 */
export function publishedLegSkip(tool, published, env = process.env) {
  return published === null ? undefined : publishedSkipped(tool, env);
}

/**
 * The line for a skipped workerd run: Miniflare comes from the repository's
 * installed dependencies, which a job that runs no install does not have.
 *
 * @param {NodeJS.ProcessEnv} [env] The environment to read.
 * @returns {string}
 */
export function workerdSkipped(env = process.env) {
  return skipLine(
    "the workerd run was skipped: miniflare is not installed here (run npm ci to include it)",
    env,
  );
}

/**
 * Whether Miniflare resolves from a repository root.
 *
 * @param {string} root The repository root.
 * @returns {boolean}
 */
export function miniflareAvailable(root) {
  try {
    createRequire(path.join(root, "package.json")).resolve("miniflare");
    return true;
  } catch {
    return false;
  }
}

/**
 * The Chromium the browser leg launches: the remote session's preinstalled
 * one, or the one this repository's Playwright installs. Playwright comes from
 * the repository's installed dependencies, as Miniflare does for the workerd
 * leg, and nothing is installed for the leg.
 *
 * @param {string} root The repository root.
 * @param {string} [remote] The remote session's Chromium.
 * @returns {string | undefined} The binary, or undefined when Playwright does
 *   not resolve or its browser has not been installed (`npm run
 *   playwright:install -w @mapcairn/web`).
 */
export function chromiumExecutable(root, remote = REMOTE_SESSION_CHROMIUM) {
  try {
    const playwright = createRequire(path.join(root, "package.json"))(
      "playwright-core",
    );
    if (existsSync(remote)) {
      return remote;
    }
    const installed = playwright.chromium.executablePath();
    return existsSync(installed) ? installed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether Playwright resolves from a repository root.
 *
 * @param {string} root The repository root.
 * @returns {boolean}
 */
export function playwrightAvailable(root) {
  try {
    createRequire(path.join(root, "package.json")).resolve("playwright-core");
    return true;
  } catch {
    return false;
  }
}

/**
 * What the browser leg does. With Chromium it runs. Without it, a developer's
 * machine skips with a message, as the workerd leg does without Miniflare.
 * GitHub Actions fails when the repository's dependencies are installed (so
 * Playwright is there) and its Chromium is not: a job that was meant to draw a
 * real map must not pass by skipping the drawing. Where Playwright is not
 * installed at all, as in the release workflow's `check` job, which installs
 * nothing, the leg skips with a warning annotation even there, because that
 * job could never draw it and a red `check` would block every release.
 *
 * @param {{ playwright: boolean, executable: string | undefined, env?: NodeJS.ProcessEnv }} input
 * @returns {{ action: "run" } | { action: "skip", line: string } | { action: "fail", message: string }}
 */
export function browserLegPlan({ playwright, executable, env = process.env }) {
  if (executable !== undefined) {
    return { action: "run" };
  }
  if (playwright && env.GITHUB_ACTIONS === "true") {
    return {
      action: "fail",
      message:
        "The browser leg cannot run: Chromium for Playwright is not installed. It fails instead of skipping when GITHUB_ACTIONS is set, so a job cannot pass without drawing the map. Install it with `npx --no-install playwright install --with-deps chromium` after `npm ci`.",
    };
  }
  return {
    action: "skip",
    line: skipLine(
      playwright
        ? "the browser leg was skipped: Chromium for Playwright is not installed here (run npm run playwright:install -w @mapcairn/web)"
        : "the browser leg was skipped: Playwright is not installed here (run npm ci, then npm run playwright:install -w @mapcairn/web)",
      env,
    ),
  };
}

/**
 * The problem with a Bun version, if it is too old to hold the release age.
 *
 * @param {string} version What `bun --version` printed.
 * @returns {string | undefined}
 */
export function bunVersionProblem(version) {
  const [major, minor] = version.trim().split(".").map(Number);
  if (major > 1 || (major === 1 && minor >= 3)) {
    return undefined;
  }
  return `Bun ${version.trim()} is older than ${BUN_MINIMUM_VERSION}, which is the first to read minimumReleaseAge, so the seven-day release age would not hold`;
}

/**
 * The line for a skipped Bun install. Bun is not installed for the check.
 *
 * @param {NodeJS.ProcessEnv} [env] The environment to read.
 * @returns {string}
 */
export function bunSkipped(env = process.env) {
  return skipLine(
    "the Bun install was skipped: Bun is not on the path, and the check does not install it",
    env,
  );
}

/**
 * Where corepack's script is, so it can be run with `node` on every system,
 * found the way `npmCliPath` finds npm: in the folder that holds the node
 * binary (the Windows installer) or beside it (`lib/node_modules`). Node 25
 * and later ship none.
 *
 * @param {string} [execPath] The node binary.
 * @returns {string | undefined} The absolute path of `corepack.js`, if any.
 */
export function corepackCliPath(execPath = process.execPath) {
  const folder = path.dirname(execPath);
  return [
    path.join(folder, "node_modules", "corepack", "dist", "corepack.js"),
    path.join(
      folder,
      "..",
      "lib",
      "node_modules",
      "corepack",
      "dist",
      "corepack.js",
    ),
  ].find((candidate) => existsSync(candidate));
}
