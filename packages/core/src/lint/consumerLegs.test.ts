// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BROWSER_TIMEOUT,
  BUN_MINIMUM_RELEASE_AGE,
  browserLegPlan,
  bunSettings,
  bunSkipped,
  bunVersionProblem,
  chromiumExecutable,
  corepackCliPath,
  miniflareAvailable,
  playwrightAvailable,
  publishedLegSkip,
  publishedSkipped,
  WORKER_CONDITIONS,
  workerdSkipped,
  YARN_PACKAGE_MANAGER,
  YARN_VERSION,
  yarnManifest,
  yarnSettings,
  yarnSkipped,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/consumerLegs.mjs";
import {
  COMPATIBILITY_DATE,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/workerdRun.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

describe("workerd conditions", () => {
  it("resolves the packages the way a Worker bundle does", () => {
    expect(WORKER_CONDITIONS).toEqual(["workerd", "worker", "browser"]);
  });

  it("builds the fixture Worker with those same conditions", () => {
    const config = readFileSync(
      path.join(REPO, "scripts/release/consumer/vite.worker.config.ts"),
      "utf8",
    );
    expect(config).toContain(
      `conditions: ${JSON.stringify(WORKER_CONDITIONS).replaceAll(",", ", ")}`,
    );
  });

  it("runs on workerd with the compatibility date of the reference host", () => {
    const host = readFileSync(
      path.join(REPO, "packages/web/cloudflare.config.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(host).toContain(`compatibilityDate = "${COMPATIBILITY_DATE}"`);
  });
});

describe("yarn", () => {
  it("is pinned to one exact version, so corepack fetches no moving target", () => {
    expect(YARN_VERSION).toMatch(/^4\.\d+\.\d+$/);
  });

  it("pins the download by its sha512 digest, as `corepack use` writes it", () => {
    expect(YARN_PACKAGE_MANAGER).toMatch(
      new RegExp(
        `^yarn@${YARN_VERSION.replaceAll(".", "\\.")}\\+sha512\\.[0-9a-f]{128}$`,
      ),
    );
  });

  it("uses the node-modules linker, runs no scripts, sends no telemetry and holds a three day age", () => {
    const settings = yarnSettings();
    expect(settings).toContain("nodeLinker: node-modules");
    expect(settings).toContain("enableScripts: false");
    expect(settings).toContain("enableTelemetry: false");
    expect(settings).toContain("enableImmutableInstalls: false");
    expect(settings).toContain("enableHardenedMode: false");
    expect(settings).toContain('npmMinimalAgeGate: "3d"');
  });

  it("resolves each SDK package to its tarball, as npm overrides do", () => {
    const manifest = { name: "app", overrides: { "@mapcairn/core": "file:x" } };
    expect(yarnManifest(manifest)).toEqual({
      name: "app",
      overrides: { "@mapcairn/core": "file:x" },
      resolutions: { "@mapcairn/core": "file:x" },
      packageManager: YARN_PACKAGE_MANAGER,
    });
  });

  it("refuses a manifest with no tarball overrides, since the age gate would hit the SDK packages", () => {
    expect(() => yarnManifest({ name: "app" })).toThrow(/overrides/);
  });

  it("says a skipped install as a warning annotation on GitHub Actions", () => {
    expect(yarnSkipped({ GITHUB_ACTIONS: "true" })).toMatch(
      /^::warning::.*corepack/,
    );
    expect(yarnSkipped({})).not.toMatch(/^::/);
  });

  it("says the skip covers a corepack that is missing or cannot download Yarn", () => {
    expect(yarnSkipped({})).toMatch(/missing or cannot download/);
  });
});

describe("bun", () => {
  it("holds the three day release age, in the seconds bun counts it in", () => {
    expect(BUN_MINIMUM_RELEASE_AGE).toBe(259200);
    expect(bunSettings()).toContain("minimumReleaseAge = 259200");
  });

  it("says a skipped install as a warning annotation on GitHub Actions", () => {
    expect(bunSkipped({ GITHUB_ACTIONS: "true" })).toMatch(/^::warning::.*Bun/);
    expect(bunSkipped({})).not.toMatch(/^::/);
  });
});

describe("bun version", () => {
  it("accepts 1.3 and later, which read minimumReleaseAge", () => {
    expect(bunVersionProblem("1.3.0")).toBeUndefined();
    expect(bunVersionProblem("1.4.5")).toBeUndefined();
    expect(bunVersionProblem("2.0.0")).toBeUndefined();
  });

  it("rejects an older Bun, which would ignore the release age", () => {
    expect(bunVersionProblem("1.2.9")).toMatch(/1\.3/);
    expect(bunVersionProblem("not a version")).toMatch(/1\.3/);
  });
});

describe("published mode", () => {
  it("says the leg is skipped for the published packages, as a warning on GitHub Actions", () => {
    expect(publishedSkipped("Yarn", { GITHUB_ACTIONS: "true" })).toMatch(
      /^::warning::.*Yarn.*published/,
    );
    expect(publishedSkipped("Bun", {})).not.toMatch(/^::/);
  });
});

describe("published mode wiring", () => {
  it("skips a Yarn or Bun leg against a published version", () => {
    expect(publishedLegSkip("Yarn", "0.1.0", {})).toMatch(/Yarn.*published/);
    expect(publishedLegSkip("Bun", "0.1.0", {})).toMatch(/Bun.*published/);
  });

  it("runs the leg on packed tarballs, whether packed here or given with --tarballs", () => {
    expect(publishedLegSkip("Yarn", null, {})).toBeUndefined();
  });

  it("calls both legs through that skip in the consumer check", () => {
    const check = readFileSync(
      path.join(REPO, "scripts/release/consumerCheck.mjs"),
      "utf8",
    );
    expect(check).toContain('publishedLegSkip("Yarn", published)');
    expect(check).toContain('publishedLegSkip("Bun", published)');
  });
});

describe("workerd availability", () => {
  it("finds the Miniflare this repository installs", () => {
    expect(miniflareAvailable(REPO)).toBe(true);
  });

  it("is false where no Miniflare resolves, as in a job that ran no install", () => {
    expect(miniflareAvailable(tmpdir())).toBe(false);
  });

  it("skips with a warning on GitHub Actions and names what is missing", () => {
    expect(workerdSkipped({ GITHUB_ACTIONS: "true" })).toMatch(
      /^::warning::.*workerd.*miniflare/i,
    );
    expect(workerdSkipped({})).not.toMatch(/^::/);
  });
});

describe("browser leg availability", () => {
  let scratch = "";
  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), "browser-leg-"));
  });
  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("finds no Chromium where Playwright does not resolve, as in a job that ran no install", () => {
    expect(chromiumExecutable(tmpdir(), path.join(scratch, "none"))).toBe(
      undefined,
    );
  });

  it("finds no Chromium when Playwright resolves but the browser was never installed", () => {
    mkdirSync(path.join(scratch, "node_modules", "playwright-core"), {
      recursive: true,
    });
    writeFileSync(
      path.join(scratch, "node_modules", "playwright-core", "package.json"),
      JSON.stringify({ name: "playwright-core", main: "index.js" }),
    );
    writeFileSync(
      path.join(scratch, "node_modules", "playwright-core", "index.js"),
      "exports.chromium = { executablePath: () => `${__dirname}/no-chrome` };",
    );
    writeFileSync(path.join(scratch, "package.json"), "{}");
    expect(chromiumExecutable(scratch, path.join(scratch, "none"))).toBe(
      undefined,
    );
  });

  it("finds the browser a remote session preinstalls, as the host's Playwright config does", () => {
    mkdirSync(path.join(scratch, "node_modules", "playwright-core"), {
      recursive: true,
    });
    writeFileSync(
      path.join(scratch, "node_modules", "playwright-core", "package.json"),
      JSON.stringify({ name: "playwright-core", main: "index.js" }),
    );
    writeFileSync(
      path.join(scratch, "node_modules", "playwright-core", "index.js"),
      "exports.chromium = { executablePath: () => '' };",
    );
    writeFileSync(path.join(scratch, "package.json"), "{}");
    const remote = path.join(scratch, "remote-chromium");
    writeFileSync(remote, "");
    expect(chromiumExecutable(scratch, remote)).toBe(remote);
  });

  it("finds the Playwright this repository installs", () => {
    expect(playwrightAvailable(REPO)).toBe(true);
  });

  it("finds no Playwright where none resolves, as in a job that ran no install", () => {
    expect(playwrightAvailable(scratch)).toBe(false);
  });

  it("runs the leg when Chromium is there, on any machine", () => {
    for (const env of [{}, { GITHUB_ACTIONS: "true" }]) {
      expect(
        browserLegPlan({ playwright: true, executable: "/x/chrome", env }),
      ).toEqual({ action: "run" });
    }
  });

  it("skips with a warning on a developer's machine when Chromium is missing", () => {
    const plan = browserLegPlan({
      playwright: true,
      executable: undefined,
      env: {},
    });
    expect(plan.action).toBe("skip");
    expect(plan.line).toMatch(/browser leg was skipped/i);
    expect(plan.line).toContain("playwright:install");
    expect(plan.line).not.toMatch(/^::/);
  });

  it("fails, and does not skip, when GITHUB_ACTIONS is set and the installed Playwright has no Chromium", () => {
    const plan = browserLegPlan({
      playwright: true,
      executable: undefined,
      env: { GITHUB_ACTIONS: "true" },
    });
    expect(plan.action).toBe("fail");
    expect(plan.message).toMatch(/Chromium/);
    expect(plan.message).toContain("GITHUB_ACTIONS");
  });

  it("skips with a warning annotation where no Playwright is installed at all, as the release workflow's check job is, which installs nothing", () => {
    const plan = browserLegPlan({
      playwright: false,
      executable: undefined,
      env: { GITHUB_ACTIONS: "true" },
    });
    expect(plan.action).toBe("skip");
    expect(plan.line).toMatch(/^::warning::.*browser leg was skipped/);
  });

  it("treats only the value true as GitHub Actions, as the other legs do", () => {
    expect(
      browserLegPlan({
        playwright: true,
        executable: undefined,
        env: { GITHUB_ACTIONS: "false" },
      }).action,
    ).toBe("skip");
  });

  it("cuts the leg off after a bounded time", () => {
    expect(BROWSER_TIMEOUT).toBeGreaterThan(0);
  });
});

describe("corepackCliPath", () => {
  let scratch = "";

  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), "mapcairn-corepack-path-"));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function corepackAt(...segments: string[]): string {
    const file = path.join(scratch, ...segments, "corepack.js");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "");
    return file;
  }

  it("finds it beside the node binary, as the Windows installer lays it out", () => {
    const file = corepackAt("node_modules", "corepack", "dist");
    expect(corepackCliPath(path.join(scratch, "node.exe"))).toBe(file);
  });

  it("finds it under lib, as Unix installers and version managers lay it out", () => {
    corepackAt("lib", "node_modules", "corepack", "dist");
    expect(corepackCliPath(path.join(scratch, "bin", "node"))).toContain(
      "corepack.js",
    );
  });

  it("is undefined when this Node has no corepack, as Node 25 and later have none", () => {
    expect(corepackCliPath(path.join(scratch, "node"))).toBeUndefined();
  });
});
