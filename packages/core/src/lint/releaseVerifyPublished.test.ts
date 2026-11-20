// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  installFlags,
  publishedManifest,
  RELEASE_AGE_EXCLUSIONS,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/consumerCheck.mjs";
import {
  auditProblems,
  parsePublishedArguments,
  provenanceReport,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/verifyPublished.mjs";

const LOCKED = {
  react: "19.2.0",
  "react-dom": "19.2.0",
  vite: "8.0.0",
  typescript: "7.0.2",
  "@types/react": "19.2.0",
  "@types/react-dom": "19.2.0",
};

describe("publishedManifest", () => {
  const manifest = publishedManifest({
    version: "0.1.0-rc.2",
    versions: LOCKED,
  });

  it("asks the registry for the exact published version of each SDK package", () => {
    expect(manifest.dependencies).toMatchObject({
      "@mapcairn/core": "0.1.0-rc.2",
      "@mapcairn/map": "0.1.0-rc.2",
      "@mapcairn/react": "0.1.0-rc.2",
      "@mapcairn/theme": "0.1.0-rc.2",
      react: "19.2.0",
    });
  });

  it("points at no tarball and overrides nothing, so the registry copy is what is installed", () => {
    expect(JSON.stringify(manifest)).not.toContain("file:");
    expect(manifest.overrides).toBeUndefined();
  });

  it("keeps the locked third-party tools", () => {
    expect(manifest.devDependencies).toMatchObject({
      typescript: "7.0.2",
      vite: "8.0.0",
      "@types/react": "19.2.0",
    });
  });
});

describe("RELEASE_AGE_EXCLUSIONS", () => {
  it("exempts the four SDK packages from the minimum release age and nothing else", () => {
    expect(RELEASE_AGE_EXCLUSIONS).toEqual([
      "--min-release-age-exclude=@mapcairn/core",
      "--min-release-age-exclude=@mapcairn/react",
      "--min-release-age-exclude=@mapcairn/theme",
      "--min-release-age-exclude=@mapcairn/map",
    ]);
  });
});

describe("installFlags", () => {
  it("exempts the four packages from the release age only when installing a published version", () => {
    expect(installFlags({ published: null })).toEqual([]);
    expect(installFlags({ published: "0.1.0" })).toEqual(
      RELEASE_AGE_EXCLUSIONS,
    );
  });

  it("adds the extra flags after the exemptions, and keeps them when nothing is exempt", () => {
    expect(
      installFlags({ published: null, extra: ["--legacy-peer-deps"] }),
    ).toEqual(["--legacy-peer-deps"]);
    expect(
      installFlags({ published: "0.1.0", extra: ["--legacy-peer-deps"] }),
    ).toEqual(["--legacy-peer-deps", ...RELEASE_AGE_EXCLUSIONS]);
  });
});

describe("parsePublishedArguments", () => {
  it("takes one version and expects provenance, as a release published from the workflow has it", () => {
    expect(parsePublishedArguments(["0.1.0"])).toEqual({
      version: "0.1.0",
      requireProvenance: true,
    });
    expect(parsePublishedArguments(["0.1.0-rc.2"])).toEqual({
      version: "0.1.0-rc.2",
      requireProvenance: true,
    });
  });

  it("lets a release that was published by hand say it has none, in either order", () => {
    expect(parsePublishedArguments(["0.1.0-rc.1", "--no-provenance"])).toEqual({
      version: "0.1.0-rc.1",
      requireProvenance: false,
    });
    expect(parsePublishedArguments(["--no-provenance", "0.1.0-rc.1"])).toEqual({
      version: "0.1.0-rc.1",
      requireProvenance: false,
    });
  });

  it.each([
    [[]],
    [["v0.1.0"]],
    [["0.1.0", "extra"]],
    [["--version=0.1.0"]],
    [["0.1"]],
    [["0.1.0", "--require-provenance"]],
    [["--no-provenance"]],
  ])("refuses %j", (argv) => {
    expect(() => parsePublishedArguments(argv)).toThrow(/Usage/);
  });
});

describe("auditProblems", () => {
  it("passes a clean audit that verified signatures", () => {
    expect(
      auditProblems({
        status: 0,
        stdout:
          "audited 190 packages in 2s\n\n190 packages have verified registry signatures\n\n4 packages have verified attestations\n",
        stderr: "",
      }),
    ).toEqual([]);
  });

  it("fails when the audit fails", () => {
    expect(
      auditProblems({
        status: 1,
        stdout: "1 package has an invalid registry signature",
        stderr: "",
      }),
    ).toEqual([
      "npm audit signatures failed:\n1 package has an invalid registry signature",
    ]);
  });

  it("fails when no registry signature was verified, so an empty audit cannot pass", () => {
    expect(
      auditProblems({ status: 0, stdout: "audited 0 packages\n", stderr: "" }),
    ).toEqual(["npm audit signatures verified no registry signatures"]);
  });
});

describe("provenanceReport", () => {
  const names = [
    "@mapcairn/core",
    "@mapcairn/react",
    "@mapcairn/theme",
    "@mapcairn/map",
  ];
  const answers = (provenance: boolean | null) =>
    Object.fromEntries(
      names.map((name) => [
        name,
        provenance === null
          ? null
          : { exists: true, latest: "0.1.0", provenance },
      ]),
    );

  it("says plainly which packages have provenance and which do not, without failing by default", () => {
    const report = provenanceReport(
      {
        ...answers(true),
        "@mapcairn/map": { exists: true, provenance: false },
      },
      false,
    );
    expect(report.problems).toEqual([]);
    expect(report.lines).toContain("@mapcairn/core: published with provenance");
    expect(report.lines).toContain("@mapcairn/map: no provenance");
  });

  it("fails every package without provenance when it is required", () => {
    const report = provenanceReport(answers(false), true);
    expect(report.problems).toHaveLength(4);
    expect(report.problems[0]).toMatch(/@mapcairn\/core has no provenance/);
  });

  it("passes when every package has it and it is required", () => {
    expect(provenanceReport(answers(true), true).problems).toEqual([]);
  });

  it("fails, required or not, on a package the registry did not answer for or does not have", () => {
    expect(provenanceReport(answers(null), false).problems).toHaveLength(4);
    expect(
      provenanceReport(
        { ...answers(true), "@mapcairn/core": { exists: false } },
        false,
      ).problems,
    ).toEqual(["@mapcairn/core is not on the registry"]);
  });
});
