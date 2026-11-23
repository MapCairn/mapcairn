// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  runCli,
  titleProblem,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/prTitleCheck.mjs";

describe("titleProblem", () => {
  it("accepts the titles the project merges", () => {
    for (const title of [
      "fix(build): read both shapes of npm pack --json in one place",
      "build(deps): bump the npm group across 1 directory with 5 updates",
      "build(deps-dev): bump @biomejs/biome",
      "chore(release): v0.2.0",
      "refactor!: remove the data saver setting",
      "feat(basemap)!: choose the default basemap from the theme",
      "docs: say that Dependabot raises peer ranges",
      "revert: undo the globe change",
    ]) {
      expect(titleProblem(title), title).toBeNull();
    }
  });

  it("rejects a title that is not a Conventional Commit", () => {
    for (const title of [
      "Update README.md",
      "",
      "fix",
      "fix:",
      "fix: ",
      "Fix: capitalised type",
      "fixes(core): not a type",
      "feat(core) missing colon",
      "feat(core)!missing: colon placement",
    ]) {
      expect(titleProblem(title), title).not.toBeNull();
    }
  });
});

describe("runCli", () => {
  function run(title: string | undefined) {
    const errors: string[] = [];
    const code = runCli({ PR_TITLE: title }, (line: string) =>
      errors.push(line),
    );
    return { code, errors };
  }

  it("exits 0 for a valid title and prints nothing", () => {
    expect(run("fix(core): handle bounds")).toEqual({ code: 0, errors: [] });
  });

  it("exits 1 and explains an invalid title", () => {
    const { code, errors } = run("Update README.md");
    expect(code).toBe(1);
    expect(errors.join(" ")).toContain("Conventional Commit");
  });

  it("exits 2 when no title was given, so a missing input is never a pass", () => {
    expect(run(undefined).code).toBe(2);
  });
});
