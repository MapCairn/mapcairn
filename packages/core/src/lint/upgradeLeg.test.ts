// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  breakingNames,
  fixtureAtTag,
  latestFromRegistry,
  migrationNotes,
  runStep,
  UPGRADE_HEADING,
  upgradeFromArgument,
  upgradePlan,
  upgradeProblems,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/upgradeLeg.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const NOTES = [
  "This release removes a helper.",
  "",
  "### What is new",
  "",
  "**A new `Widget`.** It draws a widget.",
  "",
  `### ${UPGRADE_HEADING}`,
  "",
  "**`oldHelper` is gone.** Use `newHelper`.",
  "",
  "Before:",
  "",
  "```ts",
  'import { oldHelper } from "@mapcairn/sdk";',
  "```",
  "",
  "After:",
  "",
  "```ts",
  'import { newHelper } from "@mapcairn/sdk";',
  "```",
  "",
  "### Thanks",
  "",
  "Everyone, and `thanksOnly`.",
].join("\n");

describe("migrationNotes", () => {
  it("holds the upgrade section, code blocks included, and nothing else", () => {
    const notes = migrationNotes(NOTES);
    expect(notes).toContain("oldHelper");
    expect(notes).toContain("newHelper");
    expect(notes).not.toContain("Widget");
    expect(notes).not.toContain("thanksOnly");
  });

  it("keeps what stands in a code span or a code block, and leaves the prose out", () => {
    const notes = migrationNotes(
      `### ${UPGRADE_HEADING}\n\n**The map is gone.** Use \`newMap\` and \`\`double \`tick\` span\`\`.\n`,
    );
    expect(notes).toContain("newMap");
    expect(notes).toContain("double `tick` span");
    expect(notes).not.toMatch(/\bmap\b/);
    expect(notes).not.toContain("gone");
  });

  it("is empty when the release changes nothing a person must do", () => {
    expect(migrationNotes("### What is new\n\n**Widget.** New.")).toBe("");
  });
});

describe("breakingNames", () => {
  it("reads the missing export out of a TypeScript error, and not the package it was imported from", () => {
    const output = `browser/main.tsx(8,3): error TS2305: Module '"@mapcairn/sdk"' has no exported member 'LiveRegionProvider'.`;
    expect(breakingNames(output)).toEqual([["LiveRegionProvider"]]);
  });

  it("reads the property and the type of an object literal error, and leaves out the TypeScript keywords", () => {
    const output = `main.tsx(3,1): error TS2322: Type 'string' is not assignable to type 'Basemap'.\nmain.tsx(4,5): error TS2353: Object literal may only specify known properties, and 'saveData' does not exist in type 'MountOptions'.`;
    expect(breakingNames(output)).toEqual([
      ["Basemap"],
      ["saveData", "MountOptions"],
    ]);
  });

  it("reads a name the bundler could not find", () => {
    const output = `error during build:\n"oldHelper" is not exported by "node_modules/@mapcairn/sdk/dist/index.js", imported by "main.tsx".`;
    expect(breakingNames(output)).toEqual([["oldHelper"]]);
  });

  it("keeps an error that names nothing, so it is never taken for a documented one", () => {
    expect(
      breakingNames(
        "main.tsx(4,5): error TS2554: Expected 2 arguments, but got 1.",
      ),
    ).toEqual([[]]);
  });

  it("is empty for output that holds no error", () => {
    expect(breakingNames("built in 2s")).toEqual([]);
  });
});

describe("upgradeProblems", () => {
  const output = `main.tsx(8,3): error TS2305: Module '"@mapcairn/sdk"' has no exported member 'oldHelper'.`;

  it("accepts a break that the notes name, and says which names they covered", () => {
    const result = upgradeProblems({
      output,
      notes: migrationNotes(NOTES),
      version: "0.3.0",
    });
    expect(result.problems).toEqual([]);
    expect(result.documented).toEqual(["oldHelper"]);
  });

  it("fails on a break that the notes do not name, and says where to write it", () => {
    const result = upgradeProblems({
      output: output.replace("oldHelper", "removedExport"),
      notes: migrationNotes(NOTES),
      version: "0.3.0",
    });
    expect(result.documented).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("removedExport");
    expect(result.problems[0]).toContain(`"${UPGRADE_HEADING}"`);
    expect(result.problems[0]).toContain("0.3.0");
  });

  it("does not take a name that stands in another section for a documented one", () => {
    const result = upgradeProblems({
      output: output.replace("oldHelper", "thanksOnly"),
      notes: migrationNotes(NOTES),
      version: "0.3.0",
    });
    expect(result.problems).toHaveLength(1);
  });

  it("does not take part of a longer name for a mention", () => {
    const result = upgradeProblems({
      output: output.replace("oldHelper", "old"),
      notes: migrationNotes(NOTES),
      version: "0.3.0",
    });
    expect(result.problems).toHaveLength(1);
  });

  it("does not take a word of the prose for a name in a code span", () => {
    const result = upgradeProblems({
      output: `main.tsx(3,4): error TS2339: Property 'map' does not exist on type 'Layer'.`,
      notes: migrationNotes(
        `### ${UPGRADE_HEADING}\n\n**The map moved.** The map is now drawn by \`MapView\`.\n`,
      ),
      version: "0.3.0",
    });
    expect(result.problems).toHaveLength(1);
  });

  it("takes a name that stands only in a Before code block for documented", () => {
    const notes = migrationNotes(
      [
        `### ${UPGRADE_HEADING}`,
        "",
        "**It was removed.**",
        "",
        "Before:",
        "",
        "```ts",
        "gone();",
        "```",
      ].join("\n"),
    );
    const result = upgradeProblems({
      output: `main.tsx(1,10): error TS2305: Module '"@mapcairn/sdk"' has no exported member 'gone'.`,
      notes,
      version: "0.3.0",
    });
    expect(result.problems).toEqual([]);
    expect(result.documented).toEqual(["gone"]);
  });

  it("does not take the end of a longer name for a mention", () => {
    const result = upgradeProblems({
      output: `main.tsx(1,10): error TS2305: Module '"@mapcairn/sdk"' has no exported member 'Helper'.`,
      notes: migrationNotes(NOTES),
      version: "0.3.0",
    });
    expect(result.problems).toHaveLength(1);
  });

  it("is covered when the notes name any one of the names an error mentions", () => {
    const result = upgradeProblems({
      output: `main.tsx(4,5): error TS2353: Object literal may only specify known properties, and 'saveData' does not exist in type 'MountOptions'.`,
      notes: "`saveData` was removed.",
      version: "0.3.0",
    });
    expect(result.problems).toEqual([]);
    expect(result.documented).toEqual(["saveData"]);
  });

  it("reads a name the bundler could not resolve", () => {
    const result = upgradeProblems({
      output: `[vite]: Could not resolve "gone" from "main.tsx"`,
      notes: "`gone` was removed.",
      version: "0.3.0",
    });
    expect(result.problems).toEqual([]);
    expect(result.documented).toEqual(["gone"]);
  });

  it("reads a name that holds a dollar sign as part of the name", () => {
    const storeError = `main.tsx(1,10): error TS2305: Module '"@mapcairn/sdk"' has no exported member '$store'.`;
    expect(
      upgradeProblems({
        output: storeError,
        notes: "`$store` moved.",
        version: "0.3.0",
      }).problems,
    ).toEqual([]);
    expect(
      upgradeProblems({
        output: storeError,
        notes: "`xstore` moved.",
        version: "0.3.0",
      }).problems,
    ).toHaveLength(1);
  });

  it("lists a name once when two errors mention it", () => {
    const line = `main.tsx(1,10): error TS2305: Module '"@mapcairn/sdk"' has no exported member 'oldHelper'.`;
    const result = upgradeProblems({
      output: `${line}\n${line.replace("(1,10)", "(2,10)")}`,
      notes: migrationNotes(NOTES),
      version: "0.3.0",
    });
    expect(result.documented).toEqual(["oldHelper"]);
  });

  it("fails on a failure that no error line explains, even beside a documented one", () => {
    const result = upgradeProblems({
      output: `error during build:\nmain.tsx(1,10): error TS2305: Module '"@mapcairn/sdk"' has no exported member 'oldHelper'.\nError: ENOSPC: no space left on device\nFound 1 error.`,
      notes: migrationNotes(NOTES),
      version: "0.3.0",
    });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("ENOSPC");
  });

  it("does not take the bundler's own heading for an unexplained failure", () => {
    const result = upgradeProblems({
      output: `error during build:\n[vite]: Could not resolve "oldHelper" from "main.tsx"\nFound 1 error.`,
      notes: migrationNotes(NOTES),
      version: "0.3.0",
    });
    expect(result.problems).toEqual([]);
  });

  it("fails on an error that names nothing", () => {
    const result = upgradeProblems({
      output: "main.tsx(4,5): error TS2554: Expected 2 arguments, but got 1.",
      notes: migrationNotes(NOTES),
      version: "0.3.0",
    });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("TS2554");
  });

  it("fails on a failed step whose output holds no error line at all", () => {
    const result = upgradeProblems({
      output: "Segmentation fault",
      notes: "",
      version: "0.3.0",
    });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("Segmentation fault");
  });
});

describe("upgradePlan", () => {
  it("runs when the packed version is newer than the latest published one", () => {
    expect(
      upgradePlan({ packed: "0.3.0", latest: "0.2.0", from: null }),
    ).toEqual({ action: "run", from: "0.2.0", to: "0.3.0" });
  });

  it("skips when the packed version is the one already published, which is every pull request between releases", () => {
    const plan = upgradePlan({ packed: "0.2.0", latest: "0.2.0", from: null });
    expect(plan.action).toBe("skip");
    expect(plan.line).toContain("0.2.0");
  });

  it("skips when the branch is older than the latest release", () => {
    expect(
      upgradePlan({ packed: "0.1.0", latest: "0.2.0", from: null }).action,
    ).toBe("skip");
  });

  it("skips, and says so, when nothing is published yet", () => {
    const plan = upgradePlan({ packed: "0.1.0", latest: null, from: null });
    expect(plan.action).toBe("skip");
    expect(plan.line).toContain("no published release");
  });

  it("runs from the version it is given, even when that is the packed one", () => {
    expect(
      upgradePlan({ packed: "0.2.0", latest: "0.2.0", from: "0.1.0" }),
    ).toEqual({ action: "run", from: "0.1.0", to: "0.2.0" });
  });

  it("refuses a version that is not a version", () => {
    expect(() =>
      upgradePlan({ packed: "0.2.0", latest: null, from: "latest" }),
    ).toThrow(/not a version/);
  });

  it("orders a prerelease before its release", () => {
    expect(
      upgradePlan({ packed: "0.3.0", latest: "0.3.0-rc.1", from: null }).action,
    ).toBe("run");
  });
});

describe("latestFromRegistry", () => {
  it("reads the version npm printed", () => {
    expect(
      latestFromRegistry({ ok: true, stdout: "0.2.0\n", stderr: "" }),
    ).toBe("0.2.0");
  });

  it("is null when the package has no latest tag", () => {
    expect(
      latestFromRegistry({ ok: true, stdout: "\n", stderr: "" }),
    ).toBeNull();
  });

  it("is null for a package the registry does not have", () => {
    expect(
      latestFromRegistry({
        ok: false,
        stdout: "",
        stderr: "npm error code E404\nnpm error 404 Not Found",
      }),
    ).toBeNull();
  });

  it("stops on any other failure, so a registry outage is not read as a first release", () => {
    expect(() =>
      latestFromRegistry({ ok: false, stdout: "", stderr: "ETIMEDOUT" }),
    ).toThrow(/ETIMEDOUT/);
  });
});

describe("a deliberately breaking export change", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "upgrade-leg-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** An app that imports `oldHelper` from a stand-in for the SDK. */
  function appOver(exportsText: string): string {
    const sdk = path.join(root, "node_modules", "@mapcairn", "sdk");
    mkdirSync(sdk, { recursive: true });
    writeFileSync(
      path.join(sdk, "package.json"),
      JSON.stringify({ name: "@mapcairn/sdk", types: "index.d.ts" }),
    );
    writeFileSync(path.join(sdk, "index.d.ts"), exportsText);
    writeFileSync(
      path.join(root, "main.ts"),
      'import { oldHelper } from "@mapcairn/sdk";\noldHelper();\n',
    );
    writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "esnext",
          moduleResolution: "bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["main.ts"],
      }),
    );
    return root;
  }

  function typeCheck(app: string) {
    return runStep({
      args: [
        path.join(REPO, "node_modules", "typescript", "bin", "tsc"),
        "-p",
        "tsconfig.json",
      ],
      cwd: app,
    });
  }

  it("passes while the export is still there", () => {
    const step = typeCheck(
      appOver("export declare function oldHelper(): void;"),
    );
    expect(step.ok).toBe(true);
  });

  it("fails the leg when the export is removed and the notes do not say so", () => {
    const step = typeCheck(
      appOver("export declare function newHelper(): void;"),
    );
    expect(step.ok).toBe(false);
    const result = upgradeProblems({
      output: step.output,
      notes: "",
      version: "0.3.0",
    });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("oldHelper");
  });

  it("lets it through when the notes name the export", () => {
    const step = typeCheck(
      appOver("export declare function newHelper(): void;"),
    );
    const result = upgradeProblems({
      output: step.output,
      notes: migrationNotes(NOTES),
      version: "0.3.0",
    });
    expect(result.problems).toEqual([]);
    expect(result.documented).toEqual(["oldHelper"]);
  });
});

describe("upgradeFromArgument", () => {
  it("is null when the flag is not given", () => {
    expect(upgradeFromArgument(["--tarballs", "release"])).toBeNull();
  });

  it("reads the version after the flag", () => {
    expect(upgradeFromArgument(["--upgrade-from", "0.2.0"])).toBe("0.2.0");
  });

  it("throws when the flag has no value, so a typo cannot turn into a skipped leg", () => {
    expect(() => upgradeFromArgument(["--upgrade-from"])).toThrow(
      /needs a version/,
    );
    expect(() =>
      upgradeFromArgument(["--upgrade-from", "--tarballs", "release"]),
    ).toThrow(/needs a version/);
  });
});

describe("fixtureAtTag", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "upgrade-fixture-"));
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  function git(...args: string[]) {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  }

  it("reads the folder as the tag left it, not as the branch has it now", () => {
    git("init", "-q");
    git("config", "user.email", "test@example.test");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    git("config", "tag.gpgsign", "false");
    mkdirSync(path.join(repo, "page", "sub"), { recursive: true });
    writeFileSync(path.join(repo, "page", "main.tsx"), "old");
    writeFileSync(path.join(repo, "page", "sub", "a.css"), "css");
    git("add", ".");
    git("commit", "-q", "-m", "release");
    git("tag", "v1.0.0");
    writeFileSync(path.join(repo, "page", "main.tsx"), "new");
    git("commit", "-qam", "later");

    const files = fixtureAtTag({ root: repo, tag: "v1.0.0", folder: "page" });
    expect(files).toEqual([
      { file: "main.tsx", text: "old" },
      { file: path.join("sub", "a.css"), text: "css" },
    ]);
  });

  it("stops when a listed file cannot be read", () => {
    git("init", "-q");
    git("config", "user.email", "test@example.test");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    git("config", "tag.gpgsign", "false");
    mkdirSync(path.join(repo, "page"));
    writeFileSync(path.join(repo, "page", "main.tsx"), "x");
    git("add", ".");
    git("commit", "-q", "-m", "release");
    git("tag", "v1.0.0");
    // A gitlink in the tree is listed but has no blob to show.
    git(
      "update-index",
      "--add",
      "--cacheinfo",
      "160000,1111111111111111111111111111111111111111,page/module",
    );
    git("commit", "-q", "-m", "submodule");
    git("tag", "v1.0.1");
    expect(() =>
      fixtureAtTag({ root: repo, tag: "v1.0.1", folder: "page" }),
    ).toThrow(/Could not read page\/module at v1.0.1/);
  });

  it("stops with a message about fetching tags when the tag is missing", () => {
    git("init", "-q");
    expect(() =>
      fixtureAtTag({ root: repo, tag: "v9.9.9", folder: "page" }),
    ).toThrow(/git fetch --tags/);
  });
});
