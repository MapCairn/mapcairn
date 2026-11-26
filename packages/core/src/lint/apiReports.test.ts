// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  changedLines,
  compareReports,
  generateReports,
  main,
  run,
  summariseMessages,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/apiReports.mjs";
import {
  entryPointsOfManifest,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/buildPackage.mjs";
import {
  BUILT_SDK_PACKAGES,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/sdkPackages.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const BUILT_PACKAGES: readonly string[] = BUILT_SDK_PACKAGES;

/**
 * API Extractor type-checks a package and everything its declarations import.
 * Alone that takes 0.7 to 7 seconds for a package (the umbrella package, which
 * re-exports the others, is the slowest). Running with the other lint tests
 * under load it took up to about 72 seconds, so 180 seconds is about two and a
 * half times the worst case seen. The limit sits beside the case instead of in
 * the global timeout.
 */
const API_EXTRACTOR_TIMEOUT_MS = 180_000;

interface Comparison {
  readonly missing: string[];
  readonly changed: string[];
  readonly stale: string[];
}

let scratch = "";

beforeEach(() => {
  scratch = mkdtempSync(path.join(tmpdir(), "api-reports-"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function writeReport(name: string, text: string): void {
  mkdirSync(path.join(scratch, "api"), { recursive: true });
  writeFileSync(path.join(scratch, "api", name), text);
}

function writePackageReport(
  packageName: string,
  reportName: string,
  text: string,
): void {
  const folder = path.join(scratch, "packages", packageName, "api");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, reportName), text);
}

describe("compareReports", () => {
  it("accepts reports that match the committed files", () => {
    writeReport("index.api.md", "a\n");
    const result = compareReports(
      scratch,
      new Map([["index", "a\n"]]),
    ) as Comparison;
    expect(result).toEqual({ missing: [], changed: [], stale: [] });
  });

  it("names a report that is not committed", () => {
    const result = compareReports(
      scratch,
      new Map([["index", "a\n"]]),
    ) as Comparison;
    expect(result.missing).toEqual(["index.api.md"]);
  });

  it("names a report whose text differs", () => {
    writeReport("index.api.md", "old\n");
    const result = compareReports(
      scratch,
      new Map([["index", "new\n"]]),
    ) as Comparison;
    expect(result.changed).toEqual(["index.api.md"]);
  });

  it("names a committed report whose entry point is gone", () => {
    writeReport("index.api.md", "a\n");
    writeReport("removed.api.md", "b\n");
    const result = compareReports(
      scratch,
      new Map([["index", "a\n"]]),
    ) as Comparison;
    expect(result.stale).toEqual(["removed.api.md"]);
  });

  it("treats a checkout with Windows line endings as unchanged", () => {
    writeReport("index.api.md", "a\r\nb\r\n");
    const result = compareReports(
      scratch,
      new Map([["index", "a\nb\n"]]),
    ) as Comparison;
    expect(result.changed).toEqual([]);
  });
});

describe("changedLines", () => {
  it("shows the removed and the added lines", () => {
    expect(changedLines("a\nb\nc\n", "a\nc\nd\n")).toEqual(["- b", "+ d"]);
  });

  it("is empty when only the line endings differ", () => {
    expect(changedLines("a\r\nb\r\n", "a\nb\n")).toEqual([]);
  });

  it("stops at the limit and counts the rest", () => {
    const many = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    const result = changedLines("", many, 3) as string[];
    expect(result).toHaveLength(4);
    expect(result.at(-1)).toBe("... and 8 more lines");
  });
});

describe("summariseMessages", () => {
  it("counts the messages of each kind", () => {
    const summary = summariseMessages([
      { id: "ae-undocumented" },
      { id: "ae-undocumented" },
      { id: "tsdoc-param-tag-with-invalid-name" },
    ]) as Map<string, number>;
    expect(summary.get("ae-undocumented")).toBe(2);
    expect(summary.get("tsdoc-param-tag-with-invalid-name")).toBe(1);
  });
});

describe("run", () => {
  function output() {
    const logs: string[] = [];
    const errors: string[] = [];
    return {
      logs,
      errors,
      log: (line: string) => logs.push(line),
      error: (line: string) => errors.push(line),
    };
  }

  it("checks matching reports and prints verbose warnings and their counts", async () => {
    const { logs, errors, log, error } = output();
    for (const name of BUILT_PACKAGES) {
      writePackageReport(name, "index.api.md", "same\n");
    }
    const clean = await run("check", true, {
      root: scratch,
      env: { GITHUB_ACTIONS: "true" },
      generate: async (folder: string) => ({
        reports: new Map([["index", "same\n"]]),
        models: new Map(),
        messages:
          path.basename(folder) === "core"
            ? [
                {
                  id: "ae-undocumented",
                  text: "missing documentation",
                  file: path.join(folder, "src/a.ts"),
                  line: 3,
                },
              ]
            : [],
      }),
      log,
      error,
    });

    expect(clean).toBe(true);
    expect(errors).toEqual([]);
    expect(logs).toContain("::group::@mapcairn/core documentation warnings");
    expect(
      logs.some(
        (line) =>
          line.includes("ae-undocumented: missing documentation") &&
          line.includes("src/a.ts:3"),
      ),
    ).toBe(true);
    expect(logs).toContain("@mapcairn/core: 1 ae-undocumented.");
    expect(logs).toContain(
      "::warning title=API documentation::@mapcairn/core: 1 ae-undocumented.",
    );
    expect(logs).toContain("@mapcairn/react: no warnings.");
  });

  it.each([
    { label: "GITHUB_ACTIONS unset", env: {} },
    { label: "GITHUB_ACTIONS false", env: { GITHUB_ACTIONS: "false" } },
  ])("raises no annotation outside Actions: $label", async ({ env }) => {
    const { logs, log, error } = output();
    for (const name of BUILT_PACKAGES) {
      writePackageReport(name, "index.api.md", "same\n");
    }
    await run("check", true, {
      root: scratch,
      env,
      generate: async () => ({
        reports: new Map([["index", "same\n"]]),
        models: new Map(),
        messages: [{ id: "ae-undocumented", text: "x", file: undefined }],
      }),
      log,
      error,
    });

    expect(logs).toContain("@mapcairn/core: 1 ae-undocumented.");
    expect(logs.some((line) => line.startsWith("::warning"))).toBe(false);
  });

  it("lists no messages and opens no group unless verbose", async () => {
    const { logs, log, error } = output();
    for (const name of BUILT_PACKAGES) {
      writePackageReport(name, "index.api.md", "same\n");
    }
    await run("check", false, {
      root: scratch,
      env: {},
      generate: async () => ({
        reports: new Map([["index", "same\n"]]),
        models: new Map(),
        messages: [{ id: "ae-undocumented", text: "x", file: undefined }],
      }),
      log,
      error,
    });

    expect(logs).toContain("@mapcairn/core: 1 ae-undocumented.");
    expect(logs.some((line) => line.startsWith("::group::"))).toBe(false);
    expect(logs.some((line) => line.startsWith("ae-undocumented:"))).toBe(
      false,
    );
  });

  it("reports missing, changed and stale reports with a changed-line diff", async () => {
    const { errors, log, error } = output();
    for (const name of BUILT_PACKAGES) {
      if (name !== "core") {
        writePackageReport(name, "index.api.md", "new\n");
      }
    }
    writePackageReport("react", "index.api.md", "old\n");
    writePackageReport("theme", "removed.api.md", "old\n");

    const clean = await run("check", false, {
      root: scratch,
      generate: async () => ({
        reports: new Map([["index", "new\n"]]),
        models: new Map(),
        messages: [],
      }),
      log,
      error,
    });

    expect(clean).toBe(false);
    expect(errors).toContain("packages/core/api/index.api.md: not committed.");
    expect(errors).toContain("packages/react/api/index.api.md: out of date.");
    expect(errors).toContain("- old\n+ new");
    expect(errors).toContain(
      "packages/theme/api/removed.api.md: no such entry point.",
    );
    expect(errors.at(-1)).toContain("The public API changed.");
  });

  it("writes current reports and removes stale ones in update mode", async () => {
    const { errors, log, error } = output();
    for (const name of BUILT_PACKAGES) {
      writePackageReport(name, "index.api.md", "old\n");
      writePackageReport(name, "removed.api.md", "stale\n");
    }

    const clean = await run("update", false, {
      root: scratch,
      generate: async () => ({
        reports: new Map([["index", "new\n"]]),
        models: new Map(),
        messages: [],
      }),
      log,
      error,
    });

    expect(clean).toBe(true);
    expect(errors).toEqual([]);
    for (const name of BUILT_PACKAGES) {
      expect(
        readFileSync(
          path.join(scratch, "packages", name, "api", "index.api.md"),
          "utf8",
        ),
      ).toBe("new\n");
      expect(
        existsSync(
          path.join(scratch, "packages", name, "api", "removed.api.md"),
        ),
      ).toBe(false);
    }
  });
});

describe("main", () => {
  it.each([
    { args: [] },
    { args: ["unknown"] },
    { args: ["check", "--other"] },
  ])("returns 2 and prints usage for $args", async ({ args }) => {
    const errors: string[] = [];
    let called = false;
    const code = await main(
      args,
      async () => {
        called = true;
        return true;
      },
      (line: string) => errors.push(line),
    );

    expect(code).toBe(2);
    expect(called).toBe(false);
    expect(errors).toEqual([
      "Usage: node scripts/apiReports.mjs check|update [--verbose]",
    ]);
  });

  it("passes check mode and --verbose to the runner and returns 1 for a diff", async () => {
    const calls: Array<[string, boolean]> = [];
    const code = await main(
      ["check", "--verbose"],
      async (mode: string, verbose: boolean) => {
        calls.push([mode, verbose]);
        return false;
      },
      () => undefined,
    );

    expect(code).toBe(1);
    expect(calls).toEqual([["check", true]]);
  });

  it("returns 0 for a clean update and passes verbose as false without the flag", async () => {
    const calls: Array<[string, boolean]> = [];
    const code = await main(
      ["update"],
      async (mode: string, verbose: boolean) => {
        calls.push([mode, verbose]);
        return true;
      },
      () => undefined,
    );

    expect(code).toBe(0);
    expect(calls).toEqual([["update", false]]);
  });
});

describe.each(BUILT_PACKAGES)("@mapcairn/%s API reports", (name) => {
  const folder = path.join(REPO, "packages", name);
  const manifest = JSON.parse(
    readFileSync(path.join(folder, "package.json"), "utf8"),
  ) as { exports: Record<string, unknown> };
  const entries = Object.keys(entryPointsOfManifest(manifest));

  it("has a committed report for every entry point", () => {
    for (const entry of entries) {
      expect(existsSync(path.join(folder, "api", `${entry}.api.md`))).toBe(
        true,
      );
    }
  });

  it("holds no report for an entry point that does not exist", () => {
    const committed = readdirSync(path.join(folder, "api")).sort();
    expect(committed).toEqual(entries.map((entry) => `${entry}.api.md`).sort());
  });

  it(
    "matches the built declarations",
    async () => {
      const { reports } = await generateReports(folder);
      expect(compareReports(folder, reports)).toEqual({
        missing: [],
        changed: [],
        stale: [],
      });
    },
    API_EXTRACTOR_TIMEOUT_MS,
  );
});
