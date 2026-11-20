// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  installFlags,
  publishedManifest,
  RELEASE_AGE_EXCLUSIONS,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/consumerCheck.mjs";
import {
  auditProblems,
  compareWithTarballs,
  distTagReport,
  integrityReport,
  parsePackageTags,
  parsePublishedArguments,
  parseRegistryDist,
  provenanceReport,
  tarballDigests,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/verifyPublished.mjs";
import {
  SDK_PACKAGES,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/sdkPackages.mjs";

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
  it("exempts the SDK packages from the minimum release age and nothing else", () => {
    expect(RELEASE_AGE_EXCLUSIONS).toEqual([
      "--min-release-age-exclude=@mapcairn/core",
      "--min-release-age-exclude=@mapcairn/react",
      "--min-release-age-exclude=@mapcairn/theme",
      "--min-release-age-exclude=@mapcairn/map",
      "--min-release-age-exclude=@mapcairn/sdk",
    ]);
  });
});

describe("installFlags", () => {
  it("exempts the SDK packages from the release age only when installing a published version", () => {
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
    [["0.1.0", "folder", "extra"]],
    [["0.1.0", "--folder"]],
    [["0.1.0", ""]],
    [["--version=0.1.0"]],
    [["0.1"]],
    [["0.1.0", "--require-provenance"]],
    [["--no-provenance"]],
  ])("refuses %j", (argv) => {
    expect(() => parsePublishedArguments(argv)).toThrow(/Usage/);
  });
});

describe("parsePublishedArguments with a folder", () => {
  it("takes an optional folder of the release's tarballs after the version", () => {
    expect(parsePublishedArguments(["0.1.0-rc.3", "/tmp/tarballs"])).toEqual({
      version: "0.1.0-rc.3",
      requireProvenance: true,
      folder: "/tmp/tarballs",
    });
    expect(
      parsePublishedArguments([
        "--no-provenance",
        "0.1.0-rc.3",
        "/tmp/tarballs",
      ]),
    ).toEqual({
      version: "0.1.0-rc.3",
      requireProvenance: false,
      folder: "/tmp/tarballs",
    });
  });
});

describe("parseRegistryDist", () => {
  it("reads the integrity and shasum of a version", () => {
    expect(
      parseRegistryDist({
        status: 0,
        stdout: JSON.stringify({ integrity: "sha512-AAA=", shasum: "ab12" }),
        stderr: "",
      }),
    ).toEqual({ exists: true, integrity: "sha512-AAA=", shasum: "ab12" });
  });

  it("keeps a missing integrity as missing, so the report can fail on it", () => {
    expect(
      parseRegistryDist({
        status: 0,
        stdout: JSON.stringify({ shasum: "ab12" }),
        stderr: "",
      }),
    ).toEqual({ exists: true, integrity: undefined, shasum: "ab12" });
  });

  it("says a version npm does not have is not there, and a failed read is unusable", () => {
    expect(
      parseRegistryDist({
        status: 1,
        stdout: "",
        stderr: "npm error code E404",
      }),
    ).toEqual({ exists: false });
    expect(
      parseRegistryDist({ status: 1, stdout: "", stderr: "ETIMEDOUT" }),
    ).toBeNull();
    expect(
      parseRegistryDist({ status: 0, stdout: "not json", stderr: "" }),
    ).toBeNull();
    expect(
      parseRegistryDist({ status: 0, stdout: "null", stderr: "" }),
    ).toBeNull();
  });
});

describe("tarballDigests", () => {
  it("gives the SHA-512 as an SRI string and the SHA-1 as hex, as npm records them", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "mapcairn-digests-"));
    try {
      const file = path.join(folder, "mapcairn-core-0.1.0.tgz");
      writeFileSync(file, "abc");
      expect(tarballDigests(file)).toEqual({
        integrity: `sha512-${createHash("sha512").update("abc").digest("base64")}`,
        shasum: "a9993e364706816aba3e25717850c26c9cd0d89d",
      });
    } finally {
      rmSync(folder, { recursive: true });
    }
  });
});

describe("integrityReport", () => {
  const VERSION = "0.1.0-rc.3";
  const SHA512 = (letter: string) => `sha512-${letter.repeat(86)}==`;
  const SHA1 = (letter: string) => letter.repeat(40);
  const attested = { integrity: SHA512("A"), shasum: SHA1("a") };
  const files = SDK_PACKAGES.map(
    (name: string) => `mapcairn-${name}-${VERSION}.tgz`,
  );
  const letters = "ABCDEFGH";
  const digestFor = (index: number) => ({
    integrity: SHA512(letters[index]),
    shasum: SHA1(letters[index].toLowerCase()),
  });
  const digestOf = (file: string) => digestFor(files.indexOf(file));
  const matching = Object.fromEntries(
    SDK_PACKAGES.map((name: string, index: number) => [
      `@mapcairn/${name}`,
      { exists: true, ...digestFor(index) },
    ]),
  );
  const run = (overrides: {
    answers?: Record<string, unknown>;
    files?: string[];
    folder?: string | undefined;
    digestOf?: (file: string) => unknown;
  }) =>
    integrityReport({
      version: VERSION,
      folder: "folder" in overrides ? overrides.folder : "/tarballs",
      answers: { ...matching, ...overrides.answers },
      files: overrides.files ?? files,
      digestOf: overrides.digestOf ?? digestOf,
    });

  it("passes when every package's registry digests are those of the attested tarball", () => {
    const report = run({});
    expect(report.problems).toEqual([]);
    expect(report.lines).toHaveLength(SDK_PACKAGES.length);
    expect(report.lines[0]).toMatch(
      /@mapcairn\/core.*match the attested tarball/,
    );
  });

  it("fails a package whose integrity differs, naming it, both digests and the cause", () => {
    const report = run({
      answers: {
        "@mapcairn/map": {
          exists: true,
          ...digestFor(3),
          integrity: SHA512("Z"),
        },
      },
    });
    expect(report.problems).toHaveLength(1);
    const [problem] = report.problems;
    expect(problem).toContain("@mapcairn/map");
    expect(problem).toContain(SHA512("Z"));
    expect(problem).toContain(digestFor(3).integrity);
    expect(problem).toMatch(/differs from the attested tarball/);
  });

  it("fails a package whose shasum differs even when the integrity matches", () => {
    const report = run({
      answers: {
        "@mapcairn/core": { exists: true, ...attested, shasum: SHA1("b") },
      },
    });
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain(SHA1("b"));
    expect(report.problems[0]).toContain(SHA1("a"));
  });

  it("compares the integrity as written, so a hex digest is not read as a match", () => {
    const report = run({
      answers: {
        "@mapcairn/theme": { exists: true, ...attested, integrity: SHA1("a") },
      },
    });
    expect(report.problems[0]).toContain("@mapcairn/theme");
  });

  it("digests the tarball of each package, not another one", () => {
    const swapped = run({
      answers: {
        "@mapcairn/core": { exists: true, ...digestFor(1) },
      },
    });
    expect(swapped.problems).toHaveLength(1);
    expect(swapped.problems[0]).toContain("@mapcairn/core");
  });

  it("fails an integrity that lists more than one sha512 hash, even when one matches", () => {
    const report = run({
      answers: {
        "@mapcairn/react": {
          exists: true,
          ...digestFor(1),
          integrity: `${SHA512("Z")} ${digestFor(1).integrity}`,
        },
      },
    });
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain("@mapcairn/react");
  });

  it.each([
    ["no integrity", { exists: true, shasum: SHA1("a") }],
    ["no shasum", { exists: true, integrity: SHA512("A") }],
    ["no usable answer", null],
    ["the version missing", { exists: false }],
  ])("fails, and does not pass, on %s from the registry", (_label, answer) => {
    const report = run({ answers: { "@mapcairn/react": answer } });
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain("@mapcairn/react");
    expect(report.lines.join("\n")).not.toContain("@mapcairn/react");
  });

  it("fails a package whose tarball is not in the folder, and compares the rest", () => {
    const report = run({
      files: files.filter((file: string) => !file.includes("-theme-")),
    });
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain("@mapcairn/theme");
    expect(report.problems[0]).toContain(`mapcairn-theme-${VERSION}.tgz`);
    expect(report.lines).toHaveLength(SDK_PACKAGES.length - 1);
  });

  it("looks only for the exact tarball name of the version", () => {
    const report = run({
      files: files.map((file: string) => file.replace(VERSION, "0.1.0-rc.2")),
    });
    expect(report.problems).toHaveLength(SDK_PACKAGES.length);
  });

  it("says plainly that nothing was compared when no folder is given", () => {
    const report = run({ folder: undefined });
    expect(report.problems).toEqual([]);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]).toMatch(
      /integrity of the registry bytes was not compared/,
    );
  });
});

describe("compareWithTarballs", () => {
  const VERSION = "0.1.0-rc.3";
  const fileFor = (name: string) => `mapcairn-${name}-${VERSION}.tgz`;
  const sha512 = (bytes: string) =>
    `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const sha1 = (bytes: string) =>
    createHash("sha1").update(bytes).digest("hex");

  /** A folder of tarballs and a fake registry that holds exactly their bytes. */
  const setup = () => {
    const folder = mkdtempSync(path.join(tmpdir(), "mapcairn-compare-"));
    const bytes: Record<string, string> = {};
    for (const name of SDK_PACKAGES) {
      bytes[name] = `tarball bytes of ${name}`;
      writeFileSync(path.join(folder, fileFor(name)), bytes[name]);
    }
    const asked: string[][] = [];
    const view = (args: string[]) => {
      asked.push(args);
      const name = args[0].slice(0, args[0].lastIndexOf("@"));
      const held = bytes[name.replace("@mapcairn/", "")];
      return {
        status: 0,
        stdout: JSON.stringify({ integrity: sha512(held), shasum: sha1(held) }),
        stderr: "",
      };
    };
    return { folder, bytes, view, asked };
  };

  it("passes for real files whose bytes are the registry's, asking for the dist of each exact version", () => {
    const { folder, view, asked } = setup();
    try {
      const report = compareWithTarballs({ version: VERSION, folder, view });
      expect(report.problems).toEqual([]);
      expect(report.lines).toHaveLength(SDK_PACKAGES.length);
      expect(asked).toContainEqual([
        `@mapcairn/core@${VERSION}`,
        "dist",
        "--json",
      ]);
    } finally {
      rmSync(folder, { recursive: true });
    }
  });

  it("fails the package whose file differs by one byte, and only that one", () => {
    const { folder, view } = setup();
    try {
      writeFileSync(
        path.join(folder, fileFor("theme")),
        "tarball bytes of theme!",
      );
      const report = compareWithTarballs({ version: VERSION, folder, view });
      expect(report.problems).toHaveLength(1);
      expect(report.problems[0]).toContain("@mapcairn/theme");
      expect(report.problems[0]).toMatch(/differs from the attested tarball/);
    } finally {
      rmSync(folder, { recursive: true });
    }
  });

  it("does not follow a symbolic link in place of a tarball", () => {
    const { folder, view } = setup();
    try {
      const target = path.join(folder, fileFor("react"));
      unlinkSync(path.join(folder, fileFor("map")));
      symlinkSync(target, path.join(folder, fileFor("map")));
      const report = compareWithTarballs({ version: VERSION, folder, view });
      expect(report.problems).toHaveLength(1);
      expect(report.problems[0]).toContain("@mapcairn/map");
      expect(report.problems[0]).toMatch(/regular file/);
    } finally {
      rmSync(folder, { recursive: true });
    }
  });

  it("fails a package whose tarball is not in the folder", () => {
    const { folder, view } = setup();
    try {
      unlinkSync(path.join(folder, fileFor("core")));
      const report = compareWithTarballs({ version: VERSION, folder, view });
      expect(report.problems).toHaveLength(1);
      expect(report.problems[0]).toContain("@mapcairn/core");
    } finally {
      rmSync(folder, { recursive: true });
    }
  });

  it("reads nothing and says nothing was compared when no folder is given", () => {
    const view = () => {
      throw new Error("the registry must not be read");
    };
    const report = compareWithTarballs({
      version: VERSION,
      folder: undefined,
      view,
    });
    expect(report.problems).toEqual([]);
    expect(report.lines[0]).toMatch(/was not compared/);
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
    "@mapcairn/sdk",
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
    expect(report.problems).toHaveLength(SDK_PACKAGES.length);
    expect(report.problems[0]).toMatch(/@mapcairn\/core has no provenance/);
  });

  it("passes when every package has it and it is required", () => {
    expect(provenanceReport(answers(true), true).problems).toEqual([]);
  });

  it("fails, required or not, on a package the registry did not answer for or does not have", () => {
    expect(provenanceReport(answers(null), false).problems).toHaveLength(
      SDK_PACKAGES.length,
    );
    expect(
      provenanceReport(
        { ...answers(true), "@mapcairn/core": { exists: false } },
        false,
      ).problems,
    ).toEqual(["@mapcairn/core is not on the registry"]);
  });
});

describe("distTagReport", () => {
  const all = (answer: unknown) =>
    Object.fromEntries(
      (SDK_PACKAGES as string[]).map((name) => [`@mapcairn/${name}`, answer]),
    );

  it("expects a prerelease on next, and reports latest without judging it", () => {
    const report = distTagReport({
      version: "0.1.0-rc.2",
      expected: "next",
      answers: all({
        tags: { latest: "0.1.0-rc.1", next: "0.1.0-rc.2" },
        versionCount: 2,
      }),
    });
    expect(report.problems).toEqual([]);
    expect(report.lines.join("\n")).toContain("next is 0.1.0-rc.2");
    expect(report.lines.join("\n")).toContain("latest is 0.1.0-rc.1");
  });

  it("accepts the latest that npm gave a package's first version, and says so", () => {
    const report = distTagReport({
      version: "0.1.0-rc.1",
      expected: "next",
      answers: all({
        tags: { latest: "0.1.0-rc.1", next: "0.1.0-rc.1" },
        versionCount: 1,
      }),
    });
    expect(report.problems).toEqual([]);
    expect(report.lines.join("\n")).toContain("first version");
  });

  it("fails a prerelease that took latest over from an earlier version", () => {
    const report = distTagReport({
      version: "0.1.0-rc.2",
      expected: "next",
      answers: all({
        tags: { latest: "0.1.0-rc.2", next: "0.1.0-rc.2" },
        versionCount: 2,
      }),
    });
    expect(report.problems).toHaveLength(SDK_PACKAGES.length);
    expect(report.problems[0]).toContain("latest");
  });

  it("fails when the expected tag does not point at the version", () => {
    const report = distTagReport({
      version: "0.1.0-rc.2",
      expected: "next",
      answers: all({
        tags: { latest: "0.1.0-rc.1", next: "0.1.0-rc.1" },
        versionCount: 2,
      }),
    });
    expect(report.problems[0]).toContain("next is 0.1.0-rc.1, not 0.1.0-rc.2");
  });

  it("expects a stable release on latest, and an older one on previous", () => {
    expect(
      distTagReport({
        version: "0.1.0",
        expected: "latest",
        answers: all({
          tags: { latest: "0.1.0", next: "0.1.0-rc.2" },
          versionCount: 4,
        }),
      }).problems,
    ).toEqual([]);
    expect(
      distTagReport({
        version: "0.1.0",
        expected: "latest",
        answers: all({
          tags: { latest: "0.1.0-rc.2" },
          versionCount: 4,
        }),
      }).problems[0],
    ).toContain("latest is 0.1.0-rc.2, not 0.1.0");
    expect(
      distTagReport({
        version: "0.1.1",
        expected: "previous",
        answers: all({
          tags: { latest: "0.2.0", previous: "0.1.1" },
          versionCount: 5,
        }),
      }).problems,
    ).toEqual([]);
  });

  it("fails a package whose tags could not be read", () => {
    const report = distTagReport({
      version: "0.1.0",
      expected: "latest",
      answers: all(null),
    });
    expect(report.problems).toHaveLength(SDK_PACKAGES.length);
    expect(report.problems[0]).toContain("could not be read");
  });
});

describe("parsePackageTags", () => {
  const ok = (stdout: string) => ({ status: 0, stdout, stderr: "" });
  const missing = { status: 1, stdout: "", stderr: "npm error code E404" };

  it("reads where the expected tag and latest point, and how many versions there are", () => {
    expect(
      parsePackageTags({
        expected: "next",
        expectedResult: ok("0.1.0-rc.2\n"),
        latestResult: ok("0.1.0-rc.1\n"),
        versionsResult: ok('["0.1.0-rc.1","0.1.0-rc.2"]'),
      }),
    ).toEqual({
      tags: { latest: "0.1.0-rc.1", next: "0.1.0-rc.2" },
      versionCount: 2,
    });
  });

  it("counts the single version npm prints as a string, and leaves out a tag that is not set", () => {
    expect(
      parsePackageTags({
        expected: "previous",
        expectedResult: missing,
        latestResult: ok("0.2.0"),
        versionsResult: ok('"0.2.0"'),
      }),
    ).toEqual({ tags: { latest: "0.2.0" }, versionCount: 1 });
  });

  it("is null for any other failure, or an answer that is not JSON", () => {
    const other = {
      status: 1,
      stdout: "",
      stderr: "npm error code ECONNRESET",
    };
    for (const input of [
      {
        expectedResult: other,
        latestResult: ok("1.0.0"),
        versionsResult: ok("[]"),
      },
      {
        expectedResult: ok("1.0.0"),
        latestResult: other,
        versionsResult: ok("[]"),
      },
      {
        expectedResult: ok("1.0.0"),
        latestResult: ok("1.0.0"),
        versionsResult: other,
      },
      {
        expectedResult: ok("1.0.0"),
        latestResult: ok("1.0.0"),
        versionsResult: ok("x"),
      },
    ]) {
      expect(parsePackageTags({ expected: "latest", ...input })).toBeNull();
    }
  });
});
