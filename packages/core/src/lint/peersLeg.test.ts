// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  mismatchManifest,
  otherCoreManifest,
  otherVersion,
  ownPackageCopies,
  peerMismatchProblems,
  sharedCopyProblems,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/peersLeg.mjs";

const TARBALLS = {
  core: "mapcairn-core-0.3.0.tgz",
  theme: "mapcairn-theme-0.3.0.tgz",
  "adapter-maplibre": "mapcairn-adapter-maplibre-0.3.0.tgz",
  map: "mapcairn-map-0.3.0.tgz",
};

const VERSIONS = { "maplibre-gl": "6.18.0", typescript: "7.0.2" };

describe("otherVersion", () => {
  it("is a version no exact range on the release version accepts", () => {
    expect(otherVersion("0.3.0")).toBe("0.3.0-other.0");
    expect(otherVersion("0.3.0-rc.1")).toBe("0.3.0-rc.1-other.0");
  });
});

describe("mismatchManifest", () => {
  const manifest = mismatchManifest({
    tarballs: TARBALLS,
    versions: VERSIONS,
    otherCore: "file:../other-core",
  });

  it("lists the adapter, its theme from the tarballs, the engine, and core from the folder at another version", () => {
    expect(manifest.dependencies).toEqual({
      "@mapcairn/adapter-maplibre":
        "file:../tarballs/mapcairn-adapter-maplibre-0.3.0.tgz",
      "@mapcairn/theme": "file:../tarballs/mapcairn-theme-0.3.0.tgz",
      "@mapcairn/core": "file:../other-core",
      "maplibre-gl": "6.18.0",
    });
  });

  it("overrides nothing, because an override would hide the mismatch it exists to find", () => {
    expect(manifest.overrides).toBeUndefined();
  });

  it("refuses a package that has no tarball", () => {
    expect(() =>
      mismatchManifest({
        tarballs: { core: TARBALLS.core },
        versions: VERSIONS,
        otherCore: "file:../other-core",
      }),
    ).toThrow(/adapter-maplibre/);
  });
});

describe("otherCoreManifest", () => {
  it("is a core package at the other version, with nothing else", () => {
    expect(otherCoreManifest("0.3.0")).toEqual({
      name: "@mapcairn/core",
      version: "0.3.0-other.0",
    });
  });
});

describe("peerMismatchProblems", () => {
  const refusal = {
    status: 1,
    stdout: "",
    stderr:
      'npm error code ERESOLVE\nnpm error Found: @mapcairn/core@0.3.0-other.0\nnpm error peer @mapcairn/core@"0.3.0" from @mapcairn/adapter-maplibre@0.3.0',
  };

  it("passes an install that npm refused over the adapter's peer range on core", () => {
    expect(peerMismatchProblems(refusal, "0.3.0")).toEqual([]);
  });

  it("fails an install that succeeded, which is two copies of core with no message", () => {
    expect(peerMismatchProblems({ ...refusal, status: 0 }, "0.3.0")).toEqual([
      expect.stringMatching(/installed/),
    ]);
  });

  it("fails a refusal that is about something else", () => {
    expect(
      peerMismatchProblems(
        { status: 1, stdout: "", stderr: "npm error code E404" },
        "0.3.0",
      ),
    ).toEqual([expect.stringMatching(/ERESOLVE/)]);
  });

  it("fails a conflict over another package, or one that names core without the adapter's peer line", () => {
    const other = (stderr: string) =>
      peerMismatchProblems({ status: 1, stdout: "", stderr }, "0.3.0");
    expect(
      other(
        'npm error code ERESOLVE\nnpm error Found: @mapcairn/core@0.3.0-other.0\nnpm error peer maplibre-gl@"^6.18.0" from @mapcairn/adapter-maplibre@0.3.0',
      ),
    ).toEqual([expect.stringMatching(/peer range/)]);
    expect(
      other(
        'npm error code ERESOLVE\nnpm error Found: @mapcairn/core@0.3.0-other.0\nnpm error peer @mapcairn/core@"0.2.0" from @mapcairn/adapter-maplibre@0.2.0',
      ),
    ).toEqual([expect.stringMatching(/peer range/)]);
  });
});

describe("ownPackageCopies", () => {
  it("names each MapCairn package installed in more than one place", () => {
    expect(
      ownPackageCopies({
        "node_modules/@mapcairn/core": {},
        "node_modules/@mapcairn/theme": {},
        "node_modules/@mapcairn/map/node_modules/@mapcairn/core": {},
        "node_modules/react": {},
        "node_modules/x/node_modules/react": {},
      }),
    ).toEqual([
      "@mapcairn/core is installed twice: node_modules/@mapcairn/core, node_modules/@mapcairn/map/node_modules/@mapcairn/core",
    ]);
  });

  it("is empty when each is installed once", () => {
    expect(
      ownPackageCopies({
        "node_modules/@mapcairn/core": {},
        "node_modules/@mapcairn/map": {},
      }),
    ).toEqual([]);
  });
});

describe("sharedCopyProblems", () => {
  it("passes a quiet install and a clean tree", () => {
    expect(
      sharedCopyProblems({
        installOutput: "added 40 packages\nnpm warn deprecated x@1: old",
        listing: { problems: ["invalid: react@18 /app/node_modules/react"] },
      }),
    ).toEqual([]);
  });

  it("names a peer message about a MapCairn package in the install's output", () => {
    expect(
      sharedCopyProblems({
        installOutput:
          'npm warn ERESOLVE overriding peer dependency\nnpm warn peer @mapcairn/core@"0.3.0" from @mapcairn/map@0.3.0',
        listing: {},
      }),
    ).toEqual([expect.stringMatching(/peer/)]);
  });

  it("names an invalid or missing MapCairn package that npm ls reports", () => {
    expect(
      sharedCopyProblems({
        installOutput: "",
        listing: {
          problems: [
            "invalid: @mapcairn/core@0.3.0-other.0 /app/node_modules/@mapcairn/core",
            "missing: @mapcairn/theme@0.3.0, required by @mapcairn/map@0.3.0",
          ],
        },
      }),
    ).toHaveLength(2);
  });
});
