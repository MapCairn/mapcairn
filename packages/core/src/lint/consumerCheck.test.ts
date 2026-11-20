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
  CHROME_LANDMARKS,
  consumerManifest,
  LANDMARKS,
  LOCKED_TOOLS,
  layerProblems,
  lockedVersion,
  missingLandmarks,
  pnpmSettings,
  pnpmSkipped,
  SCRIPT_SET_PROPERTIES,
  stylesheetProblems,
  TYPE_CHECKS,
  umbrellaSource,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/consumerCheck.mjs";

import {
  isolatedEnvironment,
  npmCliPath,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/npm.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

describe("lockedVersion", () => {
  const lock = { packages: { "node_modules/react": { version: "19.3.1" } } };

  it("reads a version from the root lockfile", () => {
    expect(lockedVersion(lock, "react")).toBe("19.3.1");
  });

  it("fails for a package the lockfile does not hold, rather than guessing a range", () => {
    expect(() => lockedVersion(lock, "left-pad")).toThrow(/left-pad/);
  });
});

describe("consumerManifest", () => {
  const manifest = consumerManifest({
    tarballs: {
      core: "mapcairn-core-0.0.0.tgz",
      map: "mapcairn-map-0.0.0.tgz",
    },
    versions: {
      react: "19.3.1",
      "@types/react": "19.3.0",
      typescript: "7.0.2",
      vite: "8.3.8",
    },
  });

  it("installs each SDK package from its tarball", () => {
    expect(manifest.dependencies).toMatchObject({
      "@mapcairn/core": "file:../tarballs/mapcairn-core-0.0.0.tgz",
      "@mapcairn/map": "file:../tarballs/mapcairn-map-0.0.0.tgz",
      react: "19.3.1",
    });
  });

  it("overrides each SDK package, so one that depends on another takes the tarball", () => {
    expect(manifest.overrides).toEqual({
      "@mapcairn/core": "file:../tarballs/mapcairn-core-0.0.0.tgz",
      "@mapcairn/map": "file:../tarballs/mapcairn-map-0.0.0.tgz",
    });
  });

  it("keeps the tools and the type packages out of the runtime dependencies", () => {
    expect(manifest.devDependencies).toEqual({
      "@types/react": "19.3.0",
      typescript: "7.0.2",
      vite: "8.3.8",
    });
  });

  it("is an ES module project, as the node16 type check needs", () => {
    expect(manifest.type).toBe("module");
  });
});

describe("consumerManifest for an app that names only some packages", () => {
  const tarballs = {
    core: "mapcairn-core-0.0.0.tgz",
    map: "mapcairn-map-0.0.0.tgz",
    sdk: "mapcairn-sdk-0.0.0.tgz",
  };
  const versions = { react: "19.3.1", typescript: "7.0.2", vite: "8.3.8" };

  it("lists only the packages it is given as dependencies, and still overrides every one", () => {
    const manifest = consumerManifest({ tarballs, versions, direct: ["sdk"] });
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      "@mapcairn/sdk",
      "react",
    ]);
    expect(Object.keys(manifest.overrides).sort()).toEqual([
      "@mapcairn/core",
      "@mapcairn/map",
      "@mapcairn/sdk",
    ]);
  });

  it("lists every package when none is named, as the four-package app does", () => {
    const manifest = consumerManifest({ tarballs, versions });
    expect(Object.keys(manifest.dependencies)).toContain("@mapcairn/core");
    expect(Object.keys(manifest.dependencies)).toContain("@mapcairn/sdk");
  });

  it("refuses a package that has no tarball", () => {
    expect(() =>
      consumerManifest({ tarballs, versions, direct: ["theme"] }),
    ).toThrow(/theme/);
  });
});

describe("umbrellaSource", () => {
  it("points every import of the four packages at the umbrella, and nothing else", () => {
    const source = [
      'import { createFakeServices } from "@mapcairn/core";',
      'import { MapChrome } from "@mapcairn/map";',
      'import { useModelContextTool } from "@mapcairn/react";',
      'import { tokens } from "@mapcairn/theme";',
      'import { useState } from "react";',
    ].join("\n");
    expect(umbrellaSource(source)).toBe(
      [
        'import { createFakeServices } from "@mapcairn/sdk";',
        'import { MapChrome } from "@mapcairn/sdk";',
        'import { useModelContextTool } from "@mapcairn/sdk";',
        'import { tokens } from "@mapcairn/sdk";',
        'import { useState } from "react";',
      ].join("\n"),
    );
  });

  it("maps the contracts entry point to its subpath", () => {
    expect(
      umbrellaSource('import * as c from "@mapcairn/core/contracts";'),
    ).toBe('import * as c from "@mapcairn/sdk/core/contracts";');
  });

  it("replaces the two stylesheet imports with the one the umbrella ships", () => {
    expect(
      umbrellaSource(
        'import "./reset.css";\nimport "@mapcairn/theme/tokens.css";\nimport "@mapcairn/map/styles.css";\nimport { x } from "y";',
      ),
    ).toBe(
      'import "./reset.css";\nimport "@mapcairn/sdk/styles.css";\nimport { x } from "y";',
    );
  });

  it("augments the umbrella where the app augmented core", () => {
    expect(umbrellaSource('declare module "@mapcairn/core" {')).toBe(
      'declare module "@mapcairn/sdk" {',
    );
  });
});

describe("what the check reads", () => {
  it("pins every tool to a locked version", () => {
    expect(LOCKED_TOOLS).toContain("vite");
    expect(LOCKED_TOOLS).toContain("typescript");
  });

  it("type-checks under bundler, node16 and nodenext, and not node10", () => {
    expect(TYPE_CHECKS.map((check: { name: string }) => check.name)).toEqual([
      "bundler",
      "node16",
      "nodenext",
    ]);
  });
});

describe("missingLandmarks", () => {
  const page =
    '<main><section data-map-host=""></section><input type="search"><button aria-label="Zoom in"></button><p>OpenStreetMap</p></main>';

  it("passes a page that holds every landmark", () => {
    expect(missingLandmarks(page)).toEqual([]);
  });

  it("names each one a page lacks", () => {
    expect(missingLandmarks("<div></div>")).toHaveLength(LANDMARKS.length);
    expect(missingLandmarks("<div></div>", CHROME_LANDMARKS)).toEqual([
      "the main landmark",
      "the polite live region",
      "the assertive live region",
    ]);
  });

  it("asks of the bare chrome more than its landmark", () => {
    const bare =
      '<main><div></div></main><div role="status" aria-live="polite"></div><div role="alert" aria-live="assertive"></div>';
    expect(missingLandmarks(bare, CHROME_LANDMARKS)).toEqual([]);
    expect(missingLandmarks("<main></main>", CHROME_LANDMARKS)).toHaveLength(2);
  });
});

describe("stylesheetProblems", () => {
  const tokens = ':root{--abc1234:1px}[data-theme="dark"]{--abc1234:2px}';

  it("passes a sheet whose generated properties are all defined", () => {
    expect(stylesheetProblems(`${tokens}.x{width:var(--abc1234)}`)).toEqual([]);
  });

  it("lets a script set a property the list names, such as the sheet's offset", () => {
    expect(
      stylesheetProblems(
        `${tokens}.x{top:var(--sheet-offset);width:var(--abc1234)}`,
      ),
    ).toEqual([]);
  });

  it("fails when the component sheet reads a generated name the tokens do not define", () => {
    expect(stylesheetProblems(`${tokens}.x{width:var(--zzz9999)}`)).toEqual([
      "the built CSS reads --zzz9999, which no sheet defines",
    ]);
  });

  it("fails on a readable name that is not on the list, since a new one needs a decision", () => {
    expect(stylesheetProblems(`${tokens}.x{top:var(--new-thing)}`)).toEqual([
      "the built CSS reads --new-thing, which no sheet defines",
    ]);
  });

  it("lists exactly the readable properties the built component styles read", () => {
    const styles = readFileSync(
      path.join(REPO, "packages/map/dist/styles.css"),
      "utf8",
    );
    const readable = [...styles.matchAll(/var\(\s*(--[a-z]+(?:-[a-z]+)+)\b/g)]
      .map((match) => match[1])
      .sort();
    expect([...new Set(readable)]).toEqual([...SCRIPT_SET_PROPERTIES].sort());
  });

  it("fails without the dark theme, or without any component rule", () => {
    expect(stylesheetProblems(".x{width:var(--a-b)}").join("\n")).toMatch(
      /dark theme/,
    );
    expect(stylesheetProblems(tokens).join("\n")).toMatch(/component rule/);
  });
});

describe("layerProblems", () => {
  const reset =
    "@layer reset;@layer reset{button{padding:0;border:0;background:transparent}}";
  const sdk =
    "@layer abc;@layer abc{._a{padding:4px;border:1px solid red;background-color:blue}}";

  it("passes a reset layer declared before the primitives' layer", () => {
    expect(layerProblems(reset + sdk)).toEqual([]);
  });

  it("fails when the app's reset layer comes after the SDK's", () => {
    expect(layerProblems(sdk + reset)).toEqual([
      "the app's reset layer is declared after the primitives' layer",
    ]);
  });

  it("fails when the SDK adds no layer, or more than one", () => {
    expect(layerProblems(reset)).toEqual([
      "the SDK's stylesheet should add one cascade layer, found 0",
    ]);
    expect(layerProblems(reset + sdk + sdk.replaceAll("abc", "def"))).toEqual([
      "the SDK's stylesheet should add one cascade layer, found 2",
    ]);
  });

  it("fails without the app's reset layer in the build", () => {
    expect(layerProblems(sdk)).toEqual([
      "the built CSS has no @layer reset block from the app",
    ]);
  });

  it("fails when the primitives' layer lacks the rules a reset would clobber", () => {
    expect(
      layerProblems(`${reset}@layer abc{._a{color:red}}`).join("\n"),
    ).toMatch(/holds no padding rule/);
  });
});

describe("pnpm", () => {
  it("says a skipped pnpm install as a warning annotation on GitHub Actions", () => {
    expect(pnpmSkipped({ GITHUB_ACTIONS: "true" })).toMatch(/^::warning::/);
    expect(pnpmSkipped({})).not.toMatch(/^::/);
  });

  it("writes strict peers, no automatic peers, a seven day release age and the tarballs", () => {
    expect(
      pnpmSettings({ "@mapcairn/core": "file:../tarballs/core.tgz" }),
    ).toBe(
      [
        "strictPeerDependencies: true",
        "autoInstallPeers: false",
        "minimumReleaseAge: 10080",
        "overrides:",
        '  "@mapcairn/core": "file:../tarballs/core.tgz"',
        "",
      ].join("\n"),
    );
  });
});

describe("isolatedEnvironment", () => {
  it("drops what npm run sets, whatever the case, and keeps the rest", () => {
    expect(
      isolatedEnvironment({
        PATH: "/bin",
        npm_config_local_prefix: "/repo",
        NPM_CONFIG_CACHE: "/cache",
        Npm_Execpath: "/npm",
        HOME: "/home",
      }),
    ).toEqual({ PATH: "/bin", HOME: "/home" });
  });
});

describe("npmCliPath", () => {
  let scratch = "";

  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), "mapcairn-npm-path-"));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function npmAt(...segments: string[]): string {
    const file = path.join(scratch, ...segments, "npm-cli.js");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "");
    return file;
  }

  it("uses the script `npm run` names", () => {
    const file = npmAt("run");
    expect(
      npmCliPath({ npm_execpath: file }, path.join(scratch, "bin", "node")),
    ).toBe(file);
  });

  it("finds it beside the node binary, as the Windows installer lays it out", () => {
    const file = npmAt("node_modules", "npm", "bin");
    expect(npmCliPath({}, path.join(scratch, "node.exe"))).toBe(file);
  });

  it("finds it under lib, as Unix installers and version managers lay it out", () => {
    const file = npmAt("lib", "node_modules", "npm", "bin");
    expect(npmCliPath({}, path.join(scratch, "bin", "node"))).toBe(
      path.join(
        scratch,
        "bin",
        "..",
        "lib",
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js",
      ),
    );
    expect(file).toContain("npm-cli.js");
  });

  it("says so when there is no npm", () => {
    expect(() => npmCliPath({}, path.join(scratch, "node"))).toThrow(
      /Could not find npm/,
    );
  });
});
