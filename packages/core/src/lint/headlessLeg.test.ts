// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  HEADLESS_DIRECT,
  HEADLESS_FORBIDDEN,
  headlessInstallProblems,
  headlessManifest,
  isHeadlessAppFile,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/headlessLeg.mjs";

const TARBALLS = {
  core: "mapcairn-core-0.0.0.tgz",
  theme: "mapcairn-theme-0.0.0.tgz",
  "adapter-maplibre": "mapcairn-adapter-maplibre-0.0.0.tgz",
  map: "mapcairn-map-0.0.0.tgz",
};

const VERSIONS = {
  react: "19.3.1",
  "@types/react": "19.3.0",
  "maplibre-gl": "6.18.0",
  typescript: "7.0.2",
  vite: "8.3.8",
  webpack: "5.112.2",
};

describe("headlessManifest", () => {
  const manifest = headlessManifest({ tarballs: TARBALLS, versions: VERSIONS });

  it("lists only core, the adapter and the engine, with the tools beside them", () => {
    expect(manifest.dependencies).toEqual({
      "@mapcairn/core": "file:../tarballs/mapcairn-core-0.0.0.tgz",
      "@mapcairn/adapter-maplibre":
        "file:../tarballs/mapcairn-adapter-maplibre-0.0.0.tgz",
      "maplibre-gl": "6.18.0",
    });
    expect(manifest.devDependencies).toEqual({
      typescript: "7.0.2",
      vite: "8.3.8",
    });
  });

  it("lists no React and none of the interface packages, whatever versions it is given", () => {
    const listed = [
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.devDependencies),
    ];
    expect(listed.filter((name) => HEADLESS_FORBIDDEN.includes(name))).toEqual(
      [],
    );
  });

  it("overrides every packed package, so the adapter's own dependencies take the tarballs", () => {
    expect(Object.keys(manifest.overrides).sort()).toEqual([
      "@mapcairn/adapter-maplibre",
      "@mapcairn/core",
      "@mapcairn/map",
      "@mapcairn/theme",
    ]);
  });

  it("takes the registry's version of each package, with no override, for a published release", () => {
    const published = headlessManifest({
      tarballs: {},
      versions: VERSIONS,
      published: "0.2.0",
    });
    expect(published.dependencies).toEqual({
      "@mapcairn/core": "0.2.0",
      "@mapcairn/adapter-maplibre": "0.2.0",
      "maplibre-gl": "6.18.0",
    });
    expect(published.overrides).toEqual({});
  });

  it("fails when a tarball for a listed package is missing", () => {
    expect(() =>
      headlessManifest({
        tarballs: { core: TARBALLS.core },
        versions: VERSIONS,
      }),
    ).toThrow(/adapter-maplibre/);
  });

  it("names the two packages in HEADLESS_DIRECT", () => {
    expect(HEADLESS_DIRECT).toEqual(["core", "adapter-maplibre"]);
  });
});

describe("headlessInstallProblems", () => {
  const clean = {
    "": { name: "app" },
    "node_modules/@mapcairn/core": { version: "0.0.0" },
    "node_modules/@mapcairn/theme": { version: "0.0.0" },
    "node_modules/@mapcairn/adapter-maplibre": { version: "0.0.0" },
    "node_modules/maplibre-gl": { version: "6.18.0" },
  };

  it("passes an install with the two packages, their theme and the engine", () => {
    expect(headlessInstallProblems(clean)).toEqual([]);
  });

  it("passes when a package declares an optional react peer that nothing installed", () => {
    expect(
      headlessInstallProblems({
        ...clean,
        "node_modules/zustand": {
          version: "5.0.0",
          peerDependencies: { react: ">=18" },
          peerDependenciesMeta: { react: { optional: true } },
        },
      }),
    ).toEqual([]);
  });

  it.each([
    "react",
    "react-dom",
    "@mapcairn/map",
    "@mapcairn/react",
    "@mapcairn/sdk",
  ])("fails when %s is installed", (name) => {
    expect(
      headlessInstallProblems({
        ...clean,
        [`node_modules/${name}`]: { version: "1.0.0" },
      }),
    ).toEqual([expect.stringContaining(name)]);
  });

  it("finds a copy nested under another package", () => {
    expect(
      headlessInstallProblems({
        ...clean,
        "node_modules/maplibre-gl/node_modules/react": { version: "19.3.1" },
      }),
    ).toEqual([
      expect.stringContaining("node_modules/maplibre-gl/node_modules/react"),
    ]);
  });

  it("does not take a package that only ends in the same letters for React", () => {
    expect(
      headlessInstallProblems({
        ...clean,
        "node_modules/preact": { version: "10.0.0" },
        "node_modules/@scope/react": { version: "1.0.0" },
      }),
    ).toEqual([]);
  });
});

describe("isHeadlessAppFile", () => {
  it.each([
    "index.html",
    "tsconfig.json",
    "src/main.ts",
    "src/headlessMap.ts",
    "src/page.css",
  ])("takes %s into the app", (file) => {
    expect(isHeadlessAppFile(file)).toBe(true);
  });

  it.each([
    "package.json",
    "vitest.config.ts",
    "src/headlessMap.test.ts",
    "node_modules",
    "node_modules/vite/index.js",
    "README.md",
  ])("leaves %s out", (file) => {
    expect(isHeadlessAppFile(file)).toBe(false);
  });
});
