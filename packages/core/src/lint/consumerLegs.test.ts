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
  BUN_MINIMUM_RELEASE_AGE,
  bunSettings,
  bunSkipped,
  corepackCliPath,
  WORKER_CONDITIONS,
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
    );
    expect(host).toContain(`compatibilityDate = "${COMPATIBILITY_DATE}"`);
  });
});

describe("yarn", () => {
  it("is pinned to one exact version, so corepack fetches no moving target", () => {
    expect(YARN_VERSION).toMatch(/^4\.\d+\.\d+$/);
  });

  it("uses the node-modules linker, runs no scripts, sends no telemetry and holds a seven day age", () => {
    const settings = yarnSettings();
    expect(settings).toContain("nodeLinker: node-modules");
    expect(settings).toContain("enableScripts: false");
    expect(settings).toContain("enableTelemetry: false");
    expect(settings).toContain('npmMinimalAgeGate: "7d"');
  });

  it("resolves each SDK package to its tarball, as npm overrides do", () => {
    const manifest = { name: "app", overrides: { "@mapcairn/core": "file:x" } };
    expect(yarnManifest(manifest)).toEqual({
      name: "app",
      overrides: { "@mapcairn/core": "file:x" },
      resolutions: { "@mapcairn/core": "file:x" },
    });
  });

  it("says a skipped install as a warning annotation on GitHub Actions", () => {
    expect(yarnSkipped({ GITHUB_ACTIONS: "true" })).toMatch(
      /^::warning::.*corepack/,
    );
    expect(yarnSkipped({})).not.toMatch(/^::/);
  });
});

describe("bun", () => {
  it("holds the seven day release age, in the seconds bun counts it in", () => {
    expect(BUN_MINIMUM_RELEASE_AGE).toBe(604800);
    expect(bunSettings()).toContain("minimumReleaseAge = 604800");
  });

  it("says a skipped install as a warning annotation on GitHub Actions", () => {
    expect(bunSkipped({ GITHUB_ACTIONS: "true" })).toMatch(/^::warning::.*Bun/);
    expect(bunSkipped({})).not.toMatch(/^::/);
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
