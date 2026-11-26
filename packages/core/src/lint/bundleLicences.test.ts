// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertBundledLicences,
  bundledPackagesOf,
  judgeBundledPackages,
  licenceInUse,
  licenceSectionOfReadme,
  noticesOf,
  withDependencies,
  writeNotices,
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
  it("lists each package with its version, licence and the text from its own licence file", () => {
    const directory = install(
      "left-pad",
      { license: "MIT" },
      { LICENSE: "Copyright (c) Someone" },
    );
    const text: string = noticesOf(
      [{ name: "left-pad", version: "1.2.3", licence: "MIT", directory }],
      ALLOWLIST,
    );
    expect(text).toContain("## left-pad 1.2.3");
    expect(text).toContain("Licence: MIT");
    expect(text).toContain("Copyright (c) Someone");
    expect(text).not.toContain("Used under");
  });

  it("says which side it uses for a licence that offers a choice, and ships every licence file", () => {
    const directory = install(
      "dual",
      { license: "(EDL-1.0 OR EPL-1.0)" },
      { "LICENSE-EPL": "EPL TEXT", "LICENSE-EDL-1.0": "EDL TEXT" },
    );
    const text: string = noticesOf(
      [
        {
          name: "dual",
          version: "1.2.3",
          licence: "(EDL-1.0 OR EPL-1.0)",
          directory,
        },
      ],
      ALLOWLIST,
    );
    expect(text).toContain("Used under: EDL-1.0");
    expect(text).toContain("EDL TEXT");
    expect(text).toContain("EPL TEXT");
    expect(text).toContain("LICENSE-EDL-1.0:");
  });

  it("lists every identifier of licences that all apply, and ships each file", () => {
    const directory = install(
      "both",
      { license: "(MIT AND BSD-3-Clause)" },
      { LICENSE: "MIT TEXT", "LICENSE.third-party": "BSD TEXT" },
    );
    const text: string = noticesOf(
      [
        {
          name: "both",
          version: "1.2.3",
          licence: "(MIT AND BSD-3-Clause)",
          directory,
        },
      ],
      ALLOWLIST,
    );
    expect(text).toContain("All of these apply: MIT, BSD-3-Clause");
    expect(text).not.toContain("Used under");
    expect(text).toContain("MIT TEXT");
    expect(text).toContain("BSD TEXT");
  });

  it("ships a notice file beside the licence, and every licence file in name order", () => {
    const directory = install(
      "apache",
      { license: "MIT" },
      {
        "LICENSE.md": "SECOND",
        COPYING: "FIRST",
        NOTICE: "NOTICE TEXT",
        "NOTICE.txt": "MORE",
      },
    );
    const text: string = noticesOf(
      [{ name: "apache", version: "1.2.3", licence: "MIT", directory }],
      ALLOWLIST,
    );
    for (const word of ["FIRST", "SECOND", "NOTICE TEXT", "MORE"]) {
      expect(text).toContain(word);
    }
    expect(text.indexOf("FIRST")).toBeLessThan(text.indexOf("SECOND"));
  });

  it("does not take a notice file for a licence, and still looks in the README", () => {
    const directory = install(
      "notice-only",
      { license: "MIT" },
      {
        NOTICE: "NOTICE TEXT",
        "README.md": "# x\n\n## License\n\nMIT (c) Someone\n",
      },
    );
    const text: string = noticesOf(
      [{ name: "notice-only", version: "1.2.3", licence: "MIT", directory }],
      ALLOWLIST,
    );
    expect(text).toContain("MIT (c) Someone");
    expect(text).toContain("NOTICE TEXT");
    const bare = install("only-notice", { license: "MIT" }, { NOTICE: "N" });
    expect(() =>
      noticesOf(
        [
          {
            name: "only-notice",
            version: "1.2.3",
            licence: "MIT",
            directory: bare,
          },
        ],
        ALLOWLIST,
      ),
    ).toThrow(/no licence file/);
  });

  it("takes the licence section of the README for a package that ships no licence file", () => {
    const directory = install(
      "readme-only",
      { license: "MIT" },
      {
        "README.md":
          "# readme-only\n\nUse it.\n\n## License (MIT)\n\nCopyright (c) 2011 Someone\n\n### Terms\n\nPermission is granted.\n\n## Credits\n\nThanks.\n",
      },
    );
    const text: string = noticesOf(
      [{ name: "readme-only", version: "1.2.3", licence: "MIT", directory }],
      ALLOWLIST,
    );
    expect(text).toContain("Copyright (c) 2011 Someone");
    expect(text).toContain("Permission is granted.");
    expect(text).not.toContain("Thanks.");
    expect(text).not.toContain("Use it.");
  });

  it("fails when a package has no licence file to ship", () => {
    const directory = install("bare", { license: "MIT" });
    expect(() =>
      noticesOf(
        [{ name: "bare", version: "1.2.3", licence: "MIT", directory }],
        ALLOWLIST,
      ),
    ).toThrow(/bare@1\.2\.3.*no licence file/);
    const withReadme = install(
      "plain-readme",
      { license: "MIT" },
      { "README.md": "# plain-readme\n\nNothing about terms.\n" },
    );
    expect(licenceSectionOfReadme(withReadme)).toBeUndefined();
    expect(licenceSectionOfReadme(directory)).toBeUndefined();
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

describe("withDependencies", () => {
  it("adds the production dependencies of a package, all the way down, and leaves out types", () => {
    const top = install("top", {
      license: "MIT",
      dependencies: { mid: "1", "@types/mid": "1", "@scope/leaf": "1" },
      devDependencies: { tooling: "1" },
    });
    install("mid", { license: "ISC", dependencies: { leaf2: "1" } });
    install("@types/mid", { license: "MIT" });
    install("@scope/leaf", { license: "MIT" });
    install("leaf2", { license: "BSD-3-Clause" });
    install("tooling", { license: "MIT" });
    const found: Bundled[] = withDependencies([{ directory: top }]);
    expect(found.map((entry) => entry.name)).toEqual([
      "@scope/leaf",
      "leaf2",
      "mid",
      "top",
    ]);
    expect(found.find((entry) => entry.name === "mid")?.licence).toBe("ISC");
  });

  it("finds a dependency in a parent's node_modules, and each package once", () => {
    const outer = install("outer", {
      license: "MIT",
      dependencies: { shared: "1", inner: "1" },
    });
    const inner = path.join(outer, "node_modules", "inner");
    mkdirSync(inner, { recursive: true });
    writeFileSync(
      path.join(inner, "package.json"),
      JSON.stringify({
        name: "inner",
        version: "1.0.0",
        license: "MIT",
        dependencies: { shared: "1" },
      }),
    );
    install("shared", { license: "MIT" });
    const found: Bundled[] = withDependencies([
      { directory: outer },
      { directory: outer },
    ]);
    expect(found.map((entry) => entry.name)).toEqual([
      "inner",
      "outer",
      "shared",
    ]);
  });

  it("fails naming a dependency that is not installed", () => {
    const top = install("needy", {
      license: "MIT",
      dependencies: { missing: "1" },
    });
    expect(() => withDependencies([{ directory: top }])).toThrow(
      "needy needs missing, which is not installed.",
    );
  });
});

describe("writeNotices", () => {
  const file = () => path.join(root, "NOTICES.md");

  it("names the module graph's packages, the copied files' packages and what each builds in", () => {
    const graph = install("react", { license: "MIT" }, { LICENSE: "REACT" });
    const engine = install(
      "engine",
      { license: "BSD-3-Clause", dependencies: { earcut: "1" } },
      { LICENSE: "ENGINE" },
    );
    install("earcut", { license: "ISC" }, { LICENSE: "EARCUT" });
    const found: Bundled[] = writeNotices({
      moduleIds: [path.join(graph, "index.js")],
      copiedFolders: [engine],
      allowlist: {
        ...ALLOWLIST,
        licences: { ...ALLOWLIST.licences, ISC: "x" },
      },
      file: file(),
    });
    expect(found.map((entry) => entry.name)).toEqual([
      "earcut",
      "engine",
      "react",
    ]);
    const text = readFileSync(file(), "utf8");
    for (const word of [
      "## earcut",
      "EARCUT",
      "## engine",
      "ENGINE",
      "## react",
      "REACT",
    ]) {
      expect(text).toContain(word);
    }
  });

  it("fails, and writes nothing, when something a package builds in is not allowed", () => {
    const engine = install(
      "engine",
      { license: "MIT", dependencies: { copyleft: "1" } },
      { LICENSE: "x" },
    );
    install("copyleft", { license: "LGPL-3.0-only" }, { LICENSE: "x" });
    expect(() =>
      writeNotices({
        moduleIds: [],
        copiedFolders: [engine],
        allowlist: ALLOWLIST,
        file: file(),
      }),
    ).toThrow(/copyleft@1\.2\.3 is licensed LGPL-3\.0-only/);
    expect(existsSync(file())).toBe(false);
  });
});
