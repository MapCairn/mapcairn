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
  summariseMessages,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/apiReports.mjs";
import {
  entryPointsOf,
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

describe.each(BUILT_PACKAGES)("@mapcairn/%s API reports", (name) => {
  const folder = path.join(REPO, "packages", name);
  const manifest = JSON.parse(
    readFileSync(path.join(folder, "package.json"), "utf8"),
  ) as { exports: Record<string, unknown> };
  const entries = Object.keys(entryPointsOf(manifest.exports));

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
