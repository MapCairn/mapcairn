// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertBundledLicences,
  bundledPackagesOf,
  judgeBundledPackages,
  licenceInUse,
  noticesOf,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/bundleLicences.mjs";

interface Bundled {
  readonly name: string;
  readonly version: string;
  readonly licence: string;
  readonly directory: string;
}

const ALLOWLIST = {
  licences: { MIT: "x", "BSD-3-Clause": "x", "EDL-1.0": "x" },
  packages: {},
};

let root: string;

function install(
  name: string,
  manifest: Record<string, unknown>,
  files: Record<string, string> = {},
): string {
  const directory = path.join(root, "node_modules", name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ name, version: "1.2.3", ...manifest }),
  );
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(path.join(directory, file), text);
  }
  return directory;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "bundle-licences-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("bundledPackagesOf", () => {
  it("names each package once, whichever of its files reached the bundle", () => {
    const react = install("react", { license: "MIT" });
    const scoped = install("@scope/tool", { license: "MIT" });
    const found: Bundled[] = bundledPackagesOf([
      path.join(react, "index.js"),
      path.join(react, "cjs", "react.production.js?commonjs-es-import"),
      path.join(scoped, "dist", "tool.js"),
    ]);
    expect(found.map((entry) => `${entry.name}@${entry.version}`)).toEqual([
      "@scope/tool@1.2.3",
      "react@1.2.3",
    ]);
    expect(found[1]?.directory).toBe(react);
  });

  it("leaves out virtual modules, the project's own packages and build helpers", () => {
    const own = install("@mapcairn/map", { license: "AGPL-3.0-only" });
    const helper = install("vite", { license: "MIT" });
    expect(
      bundledPackagesOf([
        "\0vite/preload-helper",
        path.join(own, "dist", "index.js"),
        path.join(helper, "dist", "client.js"),
      ]),
    ).toEqual([]);
  });

  it("reads a package nested in another", () => {
    const outer = install("outer", { license: "MIT" });
    const inner = path.join(outer, "node_modules", "inner");
    mkdirSync(inner, { recursive: true });
    writeFileSync(
      path.join(inner, "package.json"),
      JSON.stringify({ name: "inner", version: "9.0.0", license: "ISC" }),
    );
    const found: Bundled[] = bundledPackagesOf([path.join(inner, "a.js")]);
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe("inner");
    expect(found[0]?.licence).toBe("ISC");
  });
});

describe("judgeBundledPackages", () => {
  const entry = (name: string, licence: string): Bundled => ({
    name,
    version: "1.0.0",
    licence,
    directory: "/x",
  });

  it("passes licences on the allowlist, alone or as one side of an OR", () => {
    expect(
      judgeBundledPackages(
        [entry("a", "MIT"), entry("b", "(EDL-1.0 OR EPL-1.0)")],
        ALLOWLIST,
      ),
    ).toEqual([]);
  });

  it("names a package whose licence is not allowed", () => {
    const failures = judgeBundledPackages(
      [entry("copyleft", "LGPL-3.0-only"), entry("a", "MIT")],
      ALLOWLIST,
    );
    expect(failures).toEqual([
      expect.stringContaining("copyleft@1.0.0 is licensed LGPL-3.0-only"),
    ]);
    expect(failures[0]).toContain("scripts/sdkLicences.allowlist.json");
  });

  it("names a package with no licence", () => {
    const failures = judgeBundledPackages([entry("bare", "")], ALLOWLIST);
    expect(failures[0]).toContain("(none)");
  });

  it("accepts a package the allowlist names, with the licence it names", () => {
    const allowlist = {
      ...ALLOWLIST,
      packages: { typo: { licence: "BDS-3-Clause", reason: "A typo." } },
    };
    expect(
      judgeBundledPackages([entry("typo", "BDS-3-Clause")], allowlist),
    ).toEqual([]);
  });
});

describe("licenceInUse", () => {
  const allowed = new Set(["mit", "edl-1.0"]);

  it("takes the allowed side of an OR", () => {
    expect(licenceInUse("(EPL-1.0 OR EDL-1.0)", allowed)).toBe("EDL-1.0");
  });

  it("takes a plain identifier", () => {
    expect(licenceInUse("MIT", allowed)).toBe("MIT");
  });

  it("gives up on one that is not allowed", () => {
    expect(licenceInUse("GPL-3.0-only", allowed)).toBeUndefined();
  });
});

describe("noticesOf", () => {
  const textsFolder = () => {
    const folder = path.join(root, "texts");
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "EDL-1.0.txt"), "EDL TEXT");
    return folder;
  };

  it("lists each package with its version, licence and the text from its own licence file", () => {
    const directory = install(
      "left-pad",
      { license: "MIT" },
      { LICENSE: "Copyright (c) Someone" },
    );
    const text: string = noticesOf(
      [{ name: "left-pad", version: "1.2.3", licence: "MIT", directory }],
      ALLOWLIST,
      textsFolder(),
    );
    expect(text).toContain("## left-pad 1.2.3");
    expect(text).toContain("Licence: MIT");
    expect(text).toContain("Copyright (c) Someone");
  });

  it("takes the side it uses and ships the text of the licence the project keeps, when the package has none", () => {
    const directory = install("@turf/jsts", {
      license: "(EDL-1.0 OR EPL-1.0)",
    });
    const text: string = noticesOf(
      [
        {
          name: "@turf/jsts",
          version: "1.2.3",
          licence: "(EDL-1.0 OR EPL-1.0)",
          directory,
        },
      ],
      ALLOWLIST,
      textsFolder(),
    );
    expect(text).toContain("Used under: EDL-1.0");
    expect(text).toContain("EDL TEXT");
  });

  it("fails when there is no text to ship", () => {
    const directory = install("bare", { license: "MIT" });
    expect(() =>
      noticesOf(
        [{ name: "bare", version: "1.2.3", licence: "MIT", directory }],
        ALLOWLIST,
        textsFolder(),
      ),
    ).toThrow(/bare@1\.2\.3.*no licence text/);
  });

  it("sorts the packages so the file is the same on every build", () => {
    const b = install("b", { license: "MIT" }, { LICENSE: "B" });
    const a = install("a", { license: "MIT" }, { LICENSE: "A" });
    const text: string = noticesOf(
      [
        { name: "b", version: "1.2.3", licence: "MIT", directory: b },
        { name: "a", version: "1.2.3", licence: "MIT", directory: a },
      ],
      ALLOWLIST,
      textsFolder(),
    );
    expect(text.indexOf("## a 1.2.3")).toBeLessThan(text.indexOf("## b 1.2.3"));
  });
});

describe("assertBundledLicences", () => {
  const bundled = (name: string, licence: string): Bundled => ({
    name,
    version: "1.0.0",
    licence,
    directory: "/x",
  });

  it("does nothing when every licence is allowed", () => {
    expect(() =>
      assertBundledLicences(
        [bundled("a", "MIT"), bundled("b", "(EDL-1.0 OR EPL-1.0)")],
        ALLOWLIST,
      ),
    ).not.toThrow();
  });

  it("fails the build, naming each package that is not allowed", () => {
    expect(() =>
      assertBundledLicences(
        [
          bundled("a", "MIT"),
          bundled("copyleft", "LGPL-3.0-only"),
          bundled("bare", ""),
        ],
        ALLOWLIST,
      ),
    ).toThrow(
      /copyleft@1\.0\.0 is licensed LGPL-3\.0-only[\s\S]*bare@1\.0\.0 is licensed \(none\)/,
    );
  });
});
