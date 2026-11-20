// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALLOWLIST_FILE,
  checkSdkLicences,
  isLicenceAllowed,
  reportLines,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/sdkLicences.mjs";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts/sdkLicences.mjs",
);

const ALLOWED = new Set(["mit", "apache-2.0", "bsd-3-clause", "isc"]);

interface Failure {
  readonly name: string;
  readonly version: string;
  readonly licence: string;
  readonly requiredBy: string;
}

interface Report {
  readonly checked: number;
  readonly failures: readonly Failure[];
  readonly peers: Record<string, string[]>;
  readonly dev: Record<string, string[]>;
}

type Entry = Record<string, unknown>;

/** A lockfile with the five SDK packages, whose `core` depends on `deps`. */
function fixture(
  coreDeps: Record<string, string>,
  entries: Record<string, Entry>,
  allowlist: { packages?: Record<string, unknown> } = {},
) {
  const sdk = (name: string) => ({
    name: `@mapcairn/${name}`,
    version: "1.0.0",
    license: "AGPL-3.0-only",
  });
  const manifests = {
    "packages/core": {
      ...sdk("core"),
      dependencies: coreDeps,
      peerDependencies: { vitest: "^5" },
      devDependencies: { typescript: "7" },
    },
    "packages/map": {
      ...sdk("map"),
      dependencies: { "@mapcairn/core": "file:../core" },
    },
    "packages/react": sdk("react"),
    "packages/theme": sdk("theme"),
    "packages/sdk": {
      ...sdk("sdk"),
      dependencies: {
        "@mapcairn/core": "1.0.0",
        "@mapcairn/map": "1.0.0",
        "@mapcairn/react": "1.0.0",
        "@mapcairn/theme": "1.0.0",
      },
      peerDependencies: { react: "^19.0.0" },
    },
  };
  const lockfile = {
    packages: {
      "": { name: "root" },
      "packages/core": manifests["packages/core"],
      "packages/map": manifests["packages/map"],
      "packages/react": manifests["packages/react"],
      "packages/theme": manifests["packages/theme"],
      "packages/sdk": manifests["packages/sdk"],
      ...Object.fromEntries(
        ["core", "map", "react", "theme"].map((name) => [
          `node_modules/@mapcairn/${name}`,
          { resolved: `packages/${name}`, link: true },
        ]),
      ),
      ...entries,
    },
  };
  return {
    lockfile,
    manifests,
    allowlist: {
      licences: {
        MIT: "Permissive.",
        "Apache-2.0": "Permissive.",
        "BSD-3-Clause": "Permissive.",
        ISC: "Permissive.",
      },
      packages: {},
      ...allowlist,
    },
  };
}

function pkg(license: string | undefined, extra: Entry = {}): Entry {
  return { version: "1.2.3", ...(license ? { license } : {}), ...extra };
}

describe("isLicenceAllowed", () => {
  it("accepts lower-case operators", () => {
    expect(isLicenceAllowed("gpl-3.0-only or mit", ALLOWED)).toBe(true);
    expect(isLicenceAllowed("mit and gpl-3.0-only", ALLOWED)).toBe(false);
    expect(isLicenceAllowed("apache-2.0 with llvm-exception", ALLOWED)).toBe(
      true,
    );
  });

  it("accepts a listed identifier regardless of case", () => {
    expect(isLicenceAllowed("MIT", ALLOWED)).toBe(true);
    expect(isLicenceAllowed("apache-2.0", ALLOWED)).toBe(true);
  });

  it("rejects an identifier that is not listed", () => {
    expect(isLicenceAllowed("LGPL-3.0-or-later", ALLOWED)).toBe(false);
    expect(isLicenceAllowed("CC-BY-NC-4.0", ALLOWED)).toBe(false);
  });

  it("passes an OR expression when one side is allowed", () => {
    expect(isLicenceAllowed("MIT OR GPL-3.0-only", ALLOWED)).toBe(true);
    expect(isLicenceAllowed("(GPL-3.0-only OR Apache-2.0)", ALLOWED)).toBe(
      true,
    );
  });

  it("fails an OR expression when neither side is allowed", () => {
    expect(isLicenceAllowed("GPL-3.0-only OR MPL-2.0", ALLOWED)).toBe(false);
  });

  it("passes an AND expression only when every side is allowed", () => {
    expect(isLicenceAllowed("(MIT AND ISC)", ALLOWED)).toBe(true);
    expect(isLicenceAllowed("(MIT AND CC-BY-3.0)", ALLOWED)).toBe(false);
  });

  it("binds AND tighter than OR and honours brackets", () => {
    expect(isLicenceAllowed("MIT OR GPL-3.0-only AND ISC", ALLOWED)).toBe(true);
    expect(isLicenceAllowed("GPL-3.0-only AND MIT OR ISC", ALLOWED)).toBe(true);
    expect(isLicenceAllowed("GPL-3.0-only AND (MIT OR ISC)", ALLOWED)).toBe(
      false,
    );
  });

  it("judges X WITH exception as X", () => {
    expect(isLicenceAllowed("Apache-2.0 WITH LLVM-exception", ALLOWED)).toBe(
      true,
    );
    expect(
      isLicenceAllowed("GPL-2.0-only WITH Classpath-exception-2.0", ALLOWED),
    ).toBe(false);
  });

  it("rejects text that is not an SPDX expression", () => {
    for (const text of [
      "",
      "SEE LICENSE IN LICENSE.md",
      "MIT OR",
      "(MIT",
      "MIT)",
      "AND MIT",
      "MIT WITH",
      "()",
      "MIT MIT",
      "MIT OR ISC GPL-3.0-only",
    ]) {
      expect(isLicenceAllowed(text, ALLOWED)).toBe(false);
    }
  });
});

describe("checkSdkLicences", () => {
  it("passes a permissive tree, followed down through transitive dependencies", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { a: "1.0.0" },
        {
          "node_modules/a": pkg("MIT", { dependencies: { b: "1.0.0" } }),
          "node_modules/b": pkg("(MIT OR Apache-2.0)"),
        },
      ),
    );
    expect(report.failures).toEqual([]);
    expect(report.checked).toBe(2);
  });

  it("fails a disallowed licence, even deep in the tree, and names the SDK package that needs it", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { a: "1.0.0" },
        {
          "node_modules/a": pkg("MIT", { dependencies: { b: "1.0.0" } }),
          "node_modules/b": pkg("CC-BY-NC-4.0"),
        },
      ),
    );
    expect(report.failures).toEqual([
      {
        name: "b",
        version: "1.2.3",
        licence: "CC-BY-NC-4.0",
        requiredBy: "@mapcairn/core",
      },
    ]);
  });

  it("fails a package with no licence", () => {
    const report: Report = checkSdkLicences(
      fixture({ a: "1.0.0" }, { "node_modules/a": pkg(undefined) }),
    );
    expect(report.failures.map((f) => [f.name, f.licence])).toEqual([
      ["a", "(none)"],
    ]);
  });

  it("fails a licence in an object form it cannot read", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { a: "1.0.0" },
        { "node_modules/a": pkg(undefined, { license: { type: "MIT" } }) },
      ),
    );
    expect(report.failures).toHaveLength(1);
  });

  it("fails weak copyleft until a package entry allows it, and only for that licence", () => {
    const entries = {
      "node_modules/a": pkg("LGPL-3.0-or-later"),
    };
    expect(
      checkSdkLicences(fixture({ a: "1.0.0" }, entries)).failures,
    ).toHaveLength(1);
    const allowed = {
      packages: {
        a: { licence: "LGPL-3.0-or-later", reason: "dynamically linked" },
      },
    };
    expect(
      checkSdkLicences(fixture({ a: "1.0.0" }, entries, allowed)).failures,
    ).toEqual([]);
    const relicensed = { "node_modules/a": pkg("GPL-3.0-only") };
    expect(
      checkSdkLicences(fixture({ a: "1.0.0" }, relicensed, allowed)).failures,
    ).toHaveLength(1);
  });

  it("resolves a nested copy before the hoisted one", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { a: "1.0.0" },
        {
          "node_modules/a": pkg("MIT", { dependencies: { b: "2.0.0" } }),
          "node_modules/b": pkg("GPL-3.0-only"),
          "node_modules/a/node_modules/b": pkg("ISC"),
        },
      ),
    );
    expect(report.failures).toEqual([]);
    expect(report.checked).toBe(2);
  });

  it("falls back to a parent's node_modules from a nested package", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { a: "1.0.0" },
        {
          "node_modules/a": pkg("MIT", { dependencies: { b: "1.0.0" } }),
          "node_modules/a/node_modules/b": pkg("MIT", {
            dependencies: { c: "1.0.0" },
          }),
          "node_modules/c": pkg("GPL-3.0-only"),
        },
      ),
    );
    expect(report.failures.map((f) => f.name)).toEqual(["c"]);
  });

  it("does not fail an optional dependency the lockfile does not hold", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { a: "1.0.0" },
        {
          "node_modules/a": pkg("MIT", {
            optionalDependencies: { "native-mac": "1.0.0" },
          }),
        },
      ),
    );
    expect(report.failures).toEqual([]);
  });

  it("checks an optional dependency the lockfile does hold", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { a: "1.0.0" },
        {
          "node_modules/a": pkg("MIT", {
            optionalDependencies: { native: "1.0.0" },
          }),
          "node_modules/native": pkg("GPL-3.0-only"),
        },
      ),
    );
    expect(report.failures.map((f) => f.name)).toEqual(["native"]);
  });

  it("fails a required dependency the lockfile does not hold", () => {
    const report: Report = checkSdkLicences(fixture({ missing: "1.0.0" }, {}));
    expect(report.failures.map((f) => f.name)).toEqual(["missing"]);
  });

  it("follows a link to another SDK package without judging its licence", () => {
    const report: Report = checkSdkLicences(
      fixture({ a: "1.0.0" }, { "node_modules/a": pkg("MIT") }),
    );
    expect(report.failures).toEqual([]);
    expect(report.checked).toBe(1);
  });

  it("ignores peer and dev dependencies but lists them", () => {
    const report: Report = checkSdkLicences(
      fixture(
        {},
        {
          "node_modules/vitest": pkg("GPL-3.0-only"),
          "node_modules/typescript": pkg("GPL-3.0-only"),
        },
      ),
    );
    expect(report.failures).toEqual([]);
    expect(report.peers["@mapcairn/core"]).toEqual(["vitest"]);
    expect(report.dev["@mapcairn/core"]).toEqual(["typescript"]);
  });

  it("visits a package once however many packages need it", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { a: "1.0.0", b: "1.0.0" },
        {
          "node_modules/a": pkg("MIT", { dependencies: { c: "1.0.0" } }),
          "node_modules/b": pkg("MIT", { dependencies: { c: "1.0.0" } }),
          "node_modules/c": pkg("GPL-3.0-only"),
        },
      ),
    );
    expect(report.failures).toHaveLength(1);
    expect(report.checked).toBe(3);
  });

  it("follows the peer dependencies of a transitive package", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { a: "1.0.0" },
        {
          "node_modules/a": pkg("MIT", { peerDependencies: { p: "^1" } }),
          "node_modules/p": pkg("GPL-3.0-only"),
        },
      ),
    );
    expect(report.failures.map((f) => f.name)).toEqual(["p"]);
    expect(report.checked).toBe(2);
  });

  it("skips an optional peer and a peer the lockfile does not hold", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { a: "1.0.0" },
        {
          "node_modules/a": pkg("MIT", {
            peerDependencies: { p: "^1", q: "^1" },
            peerDependenciesMeta: { p: { optional: true } },
          }),
          "node_modules/p": pkg("GPL-3.0-only"),
        },
      ),
    );
    expect(report.failures).toEqual([]);
    expect(report.checked).toBe(1);
  });

  it("walks a link to a workspace that is not an SDK package", () => {
    const report: Report = checkSdkLicences(
      fixture(
        { host: "1.0.0" },
        {
          "node_modules/host": { resolved: "packages/web", link: true },
          "packages/web": { name: "host", dependencies: { c: "1.0.0" } },
          "node_modules/c": pkg("GPL-3.0-only"),
        },
      ),
    );
    expect(report.failures.map((f) => f.name)).toEqual(["c"]);
  });
});

describe("reportLines", () => {
  it("names the packages left out and the count when the tree passes", () => {
    const text = reportLines({
      checked: 3,
      failures: [],
      peers: { "@mapcairn/core": ["vitest"] },
      dev: { "@mapcairn/core": ["typescript"] },
    }).join("\n");
    expect(text).toContain("packages/web");
    expect(text).toContain("examples/embed");
    expect(text).toContain("(the host and the example may use other licences)");
    expect(text).toContain("3 production dependencies");
    expect(text).toContain("vitest");
  });

  it("names the package, its licence and the file to edit for each failure", () => {
    const text = reportLines({
      checked: 3,
      failures: [
        {
          name: "bad-pkg",
          version: "2.0.0",
          licence: "CC-BY-NC-4.0",
          requiredBy: "@mapcairn/map",
        },
      ],
      peers: {},
      dev: {},
    }).join("\n");
    expect(text).toContain("bad-pkg@2.0.0");
    expect(text).toContain("CC-BY-NC-4.0");
    expect(text).toContain("@mapcairn/map");
    expect(text).toContain(ALLOWLIST_FILE);
    expect(text).toContain("ask the maintainer");
  });
});

/**
 * These cases start Node as a subprocess. A loaded coverage run can make the
 * short-lived command take longer than Vitest's five-second default. Bound the
 * child and leave the test enough time for process startup and cleanup.
 */
const CHILD_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 40_000;

describe("scripts/sdkLicences.mjs, run as a command", {
  timeout: TEST_TIMEOUT_MS,
}, () => {
  let root: string;

  function put(file: string, value: unknown): void {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(value));
  }

  function install(
    coreDeps: Record<string, string>,
    entries: Record<string, Entry>,
    allowlist = {},
  ): void {
    const input = fixture(coreDeps, entries, allowlist);
    put("package-lock.json", input.lockfile);
    for (const [dir, manifest] of Object.entries(input.manifests)) {
      put(`${dir}/package.json`, manifest);
    }
    put(ALLOWLIST_FILE, input.allowlist);
  }

  function run(...args: string[]) {
    return spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], {
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
    });
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "mapcairn-sdk-licences-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("exits 0 and says what it left out for a permissive tree", () => {
    install({ a: "1.0.0" }, { "node_modules/a": pkg("MIT") });
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("packages/web");
    expect(result.stdout).toContain("1 production dependencies");
  });

  it("exits 1 and names the package, licence and file for a disallowed licence", () => {
    install({ a: "1.0.0" }, { "node_modules/a": pkg("CC-BY-NC-4.0") });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("a@1.2.3");
    expect(result.stderr).toContain("CC-BY-NC-4.0");
    expect(result.stderr).toContain(ALLOWLIST_FILE);
  });

  it("exits 1 with a message when --root has no value", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--root"], {
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("could not run");
  });

  it("exits 1, not 0, when the files cannot be read", () => {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("could not run");
  });
});
