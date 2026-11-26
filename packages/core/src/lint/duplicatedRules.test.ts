// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { execFileSync } from "node:child_process";
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

/** The text files the repository tracks, relative to it, that can state a rule in prose or in code. */
function trackedTextFiles(): string[] {
  const listed = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return listed
    .split("\0")
    .filter((file) => /\.(md|mdx|yml|yaml|mjs|cjs|ts|tsx|toml)$/.test(file))
    .filter((file) => !file.endsWith("CHANGELOG.md"))
    .filter(
      (file) => file !== "packages/core/src/lint/duplicatedRules.test.ts",
    );
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** Words that make a line about the minimum age of a package version. */
const AGE_CONTEXT =
  /release age|package age|minimum age|dependency age|cooldown|exclude-newer|\bpackages? (?:version )?(?:under|younger|older|published)|age rule/i;

const DAY_COUNT = new RegExp(
  `\\b(\\d+|${Object.keys(NUMBER_WORDS).join("|")})[- ]days?\\b`,
  "gi",
);

/**
 * The day counts a text gives for the dependency age: in a sentence about the
 * minimum age of a package, every "3 days", "three-day" and similar, and every
 * `min-release-age=<n>` that is not the `=0` which lifts it for a registry read.
 */
function ageClaims(text: string): number[] {
  const claims: number[] = [];
  for (const sentence of text.split(/\n|(?<=[.;])\s+/)) {
    for (const match of sentence.matchAll(/min-release-age=(\d+)/g)) {
      if (Number(match[1]) !== 0) {
        claims.push(Number(match[1]));
      }
    }
    if (!AGE_CONTEXT.test(sentence)) {
      continue;
    }
    for (const match of sentence.matchAll(DAY_COUNT)) {
      const word = match[1].toLowerCase();
      claims.push(NUMBER_WORDS[word] ?? Number(word));
    }
  }
  return claims;
}

/**
 * The runs of five or more SDK package names a text lists in one go, such as
 * "core, react, theme, map, adapter-maplibre and the umbrella sdk".
 */
function packageRuns(text: string): string[][] {
  const name = "(?:core|react|theme|map|adapter-maplibre|sdk)";
  const run = new RegExp(
    `\\b${name}(?:(?:, | and (?:the umbrella )?)${name})+`,
    "g",
  );
  return [...text.matchAll(run)]
    .map((match) => match[0].split(/, | and (?:the umbrella )?/))
    .filter((names) => names.length >= 5);
}

describe("reading the age and the package list out of prose", () => {
  it("finds a digit, a word and a hyphenated count on a line about the age", () => {
    expect(ageClaims("A package under 7 days old needs a say-so.")).toEqual([
      7,
    ]);
    expect(ageClaims("the seven-day release age")).toEqual([7]);
    expect(ageClaims("`min-release-age=7` in .npmrc")).toEqual([7]);
  });

  it("ignores a count on a line that is not about the age, and the lifted age", () => {
    expect(ageClaims("an answer within 7 days")).toEqual([]);
    expect(ageClaims("`--min-release-age=0` reads the registry")).toEqual([]);
  });

  it("finds a run of five or more package names and keeps its order", () => {
    expect(
      packageRuns(
        "the six (core, react, theme, map, adapter-maplibre and sdk)",
      ),
    ).toEqual([["core", "react", "theme", "map", "adapter-maplibre", "sdk"]]);
    expect(packageRuns("core, map, react and theme")).toEqual([]);
  });
});

describe("the dependency age rule", () => {
  const [age] = numbersAfter(read(".npmrc"), "min-release-age");

  it("is the only age any tracked file gives for a package version", () => {
    const offenders = trackedTextFiles().filter((file) =>
      ageClaims(read(file)).some((claim) => claim !== age),
    );
    expect(offenders).toEqual([]);
  });

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

  it("is never given as a list of paths in a workflow, so a new package cannot be missed", () => {
    const listed = new RegExp(`packages/(?:${SDK_PACKAGES.join("|")})/dist`);
    const offenders = filesIn(".github/workflows", [".yml"]).filter((file) =>
      listed.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("is the only list of all six that any tracked file gives in prose", () => {
    const offenders = trackedTextFiles().filter((file) =>
      packageRuns(read(file)).some(
        (names) => names.join(",") !== SDK_PACKAGES.join(","),
      ),
    );
    expect(offenders).toEqual([]);
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

  it("for the scripts are what AGENTS.md says, and every exclusion has a reason", () => {
    expect(floors(String.raw`scripts/\*\*`)).toEqual({
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    });
    expect(read("AGENTS.md")).toContain(
      "`scripts` has 80% for statements, branches, functions and lines",
    );
    const excluded = config.match(/exclude: \[([\s\S]*?)\n {6}\],/)?.[1] ?? "";
    const scriptLines = excluded
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const unexplained = scriptLines.filter((line, index) => {
      if (!line.startsWith('"scripts/')) {
        return false;
      }
      const before = scriptLines.slice(0, index).reverse();
      const lastNonScript = before.find(
        (other) => !other.startsWith('"scripts/'),
      );
      return !lastNonScript?.startsWith("//");
    });
    expect(unexplained).toEqual([]);
  });

  it("holds exactly the ten guard scripts to the line floor on their own", () => {
    const entry = config.match(/"scripts\/\{([^"]+)\}\.mjs":\s*\{([^}]*)\}/);
    expect(entry?.[2]).toMatch(/lines: 80,\s*perFile: true/);
    const listed = (entry?.[1] ?? "")
      .replace(/([\w-]+)\/\{([^}]+)\}/g, (_all, folder, names) =>
        names
          .split(",")
          .map((name: string) => `${folder}/${name}`)
          .join(","),
      )
      .split(",")
      .sort();
    expect(listed).toEqual(
      [
        "agents/docs-refs",
        "agents/guardWrites",
        "agents/port",
        "agents/thread",
        "agents/web-guidance",
        "apiReports",
        "harmony/scan",
        "licenceHeaders",
        "moved-guides-check",
        "qualityBarCheck",
      ].sort(),
    );
  });

  it.each(["AGENTS.md", "docs/guides/repository-reference.md"])(
    "says in %s that the named scripts hold the line floor each",
    (document) => {
      expect(read(document)).toContain(
        "at least 80% of lines in each guard script named in `vitest.config.ts`",
      );
    },
  );
});
