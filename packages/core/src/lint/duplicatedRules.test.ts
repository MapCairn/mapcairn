// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MINIMUM_RELEASE_AGE_DAYS,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/consumerLegs.mjs";
import {
  SDK_PACKAGES,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/sdkPackages.mjs";

/*
 * Rules that several files state. Each is written down once as the source of
 * truth and the others are checked against it, so a change to one cannot leave
 * the rest saying the old thing (the dependency age went from seven days to
 * three on 2026-11-23, and wording and constants kept the old figure).
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function read(relative: string): string {
  return readFileSync(path.join(REPO, relative), "utf8");
}

/** Every file directly in `directory` (relative to the repository) with one of the extensions. */
function filesIn(directory: string, extensions: readonly string[]): string[] {
  return readdirSync(path.join(REPO, directory))
    .filter((name) => extensions.some((extension) => name.endsWith(extension)))
    .filter((name) => !name.endsWith(".test.mjs"))
    .map((name) => path.posix.join(directory, name));
}

/** The numbers that follow `key` on its lines in a text, such as every `default-days`. */
function numbersAfter(text: string, key: string): number[] {
  const pattern = new RegExp(`${key}\\s*[:=]\\s*(\\d+)`, "g");
  return [...text.matchAll(pattern)].map((match) => Number(match[1]));
}

describe("the dependency age rule", () => {
  const [age] = numbersAfter(read(".npmrc"), "min-release-age");

  it("is set in .npmrc, the source of truth", () => {
    expect(age).toBeGreaterThan(0);
  });

  it("is the Dependabot cooldown everywhere it is set", () => {
    const days = numbersAfter(read(".github/dependabot.yml"), "default-days");
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((value) => value === age)).toBe(true);
  });

  it("is the zizmor cooldown", () => {
    expect(numbersAfter(read(".github/zizmor.yml"), "days")).toEqual([age]);
  });

  it("is the age the consumer check gives its package managers", () => {
    expect(MINIMUM_RELEASE_AGE_DAYS).toBe(age);
  });

  it("is what AGENTS.md says", () => {
    const agents = read("AGENTS.md");
    expect(agents).toContain(`min-release-age=${age}`);
    expect(agents).toContain(`${age}-day cooldown`);
    expect(agents).toContain(`less than ${age} days ago`);
  });

  it("is not given as seven days in a workflow, a scanner setting or a script", () => {
    const files = [
      ...filesIn(".github", [".yml"]),
      ...filesIn(".github/workflows", [".yml"]),
      ...filesIn("scripts", [".mjs", ".cjs"]),
      ...filesIn("scripts/release", [".mjs"]),
    ];
    const stale = /seven[- ]day|\b7[- ]days?\b|["']7d["']|\b7 \* 24\b/i;
    const offenders = files.filter((file) => stale.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

describe("the list of SDK packages", () => {
  it("is the one every workflow loop over the packages uses", () => {
    const loops: { file: string; names: string[] }[] = [];
    for (const file of filesIn(".github/workflows", [".yml"])) {
      for (const match of read(file).matchAll(
        /for \w+ in ((?:[a-z-]+ )+?sdk); do/g,
      )) {
        loops.push({ file, names: match[1].split(" ") });
      }
    }
    expect(loops.length).toBeGreaterThan(0);
    for (const loop of loops) {
      expect({ file: loop.file, names: loop.names }).toEqual({
        file: loop.file,
        names: [...SDK_PACKAGES],
      });
    }
  });
});

describe("the coverage floors", () => {
  const config = read("vitest.config.ts");

  /** The four figures in the threshold block opened by `selector`. */
  function floors(selector: string): Record<string, number> {
    const block = config.match(new RegExp(`"${selector}": \\{([^}]*)\\}`))?.[1];
    return Object.fromEntries(
      [...(block ?? "").matchAll(/(\w+): (\d+)/g)].map((match) => [
        match[1],
        Number(match[2]),
      ]),
    );
  }

  it("for the SDK packages are what AGENTS.md says", () => {
    expect(
      floors(
        String.raw`packages/\{core,map,react,theme,sdk,adapter-maplibre\}/\*\*`,
      ),
    ).toEqual({
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    });
    expect(read("AGENTS.md")).toContain(
      "enforces 95% for statements, branches, functions and lines",
    );
  });

  it("for the host are what AGENTS.md says", () => {
    expect(floors(String.raw`packages/web/\*\*`)).toEqual({
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    });
    expect(read("AGENTS.md")).toContain(
      "`packages/web` has 95% for statements, functions and lines and 90% for branches",
    );
  });
});
