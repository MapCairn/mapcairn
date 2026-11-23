// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ATTW_PROFILE,
  attwArguments,
  publintArguments,
  toolBinary,
  typeCheckProblems,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/packTypes.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const TARBALLS = {
  core: "/packed/mapcairn-core-1.0.0.tgz",
  react: "/packed/mapcairn-react-1.0.0.tgz",
};

describe("the arguments of the two tools", () => {
  it("runs attw on the tarball under the ESM-only profile, with no rule ignored", () => {
    const args: string[] = attwArguments(TARBALLS.core);
    expect(ATTW_PROFILE).toBe("esm-only");
    expect(args).toEqual(expect.arrayContaining(["--profile", "esm-only"]));
    expect(args.at(-1)).toBe(TARBALLS.core);
    expect(args).not.toContain("--ignore-rules");
  });

  it("runs publint on the tarball with warnings counted as errors", () => {
    const args: string[] = publintArguments(TARBALLS.core);
    expect(args[0]).toBe("run");
    expect(args).toContain("--strict");
    expect(args.at(-1)).toBe(TARBALLS.core);
  });
});

describe("toolBinary", () => {
  it("finds the installed command line script of each tool", () => {
    for (const name of ["publint", "@arethetypeswrong/cli"]) {
      expect(existsSync(toolBinary(name, REPO))).toBe(true);
    }
  });

  it("says so when the tool is not installed", () => {
    expect(() => toolBinary("no-such-tool", REPO)).toThrow(/no-such-tool/);
  });
});

describe("typeCheckProblems", () => {
  const ok = { status: 0, stdout: "All good!", stderr: "" };

  it("is empty when both tools pass on every tarball", () => {
    expect(typeCheckProblems(TARBALLS, () => ok)).toEqual([]);
  });

  it("runs both tools on every tarball", () => {
    const calls: string[] = [];
    typeCheckProblems(TARBALLS, (tool: string, args: string[]) => {
      calls.push(`${tool} ${args.at(-1)}`);
      return ok;
    });
    expect(calls.sort()).toEqual(
      [
        `attw ${TARBALLS.core}`,
        `attw ${TARBALLS.react}`,
        `publint ${TARBALLS.core}`,
        `publint ${TARBALLS.react}`,
      ].sort(),
    );
  });

  it("names the package, the tool and what it printed when a tool fails", () => {
    const problems = typeCheckProblems(
      TARBALLS,
      (tool: string, args: string[]) =>
        tool === "publint" && args.at(-1) === TARBALLS.react
          ? {
              status: 1,
              stdout: "Errors:\n1. pkg.exports is wrong",
              stderr: "",
            }
          : ok,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("react");
    expect(problems[0]).toContain("publint");
    expect(problems[0]).toContain("pkg.exports is wrong");
  });

  it("fails a tool that did not run, which is not a pass", () => {
    const problems = typeCheckProblems(
      { core: TARBALLS.core },
      (tool: string) =>
        tool === "attw"
          ? { status: null, stdout: "", stderr: "spawn failed" }
          : ok,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("attw");
    expect(problems[0]).toContain("spawn failed");
  });
});

describe("the documentation of the check", () => {
  it("says which resolutions the ESM-only profile leaves out, and that no rule is ignored", () => {
    const guide = readFileSync(
      path.join(REPO, "sites/docs/docs/guides/public-api.md"),
      "utf8",
    );
    expect(guide).toContain(`\`--profile ${ATTW_PROFILE}\``);
    expect(guide).toContain("node10");
    expect(guide).toContain("node16-cjs");
  });
});
