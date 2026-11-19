// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseArguments,
  saveIssueBody,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/issue-body.mjs";

let folder: string | undefined;

function target(): string {
  folder = mkdtempSync(path.join(tmpdir(), "mapcairn-body-"));
  return path.join(folder, "body.md");
}

afterEach(() => {
  if (folder !== undefined) {
    rmSync(folder, { recursive: true, force: true });
  }
  folder = undefined;
});

describe("parseArguments", () => {
  it("reads the number and the file, with the project repository by default", () => {
    expect(parseArguments(["42", "out.md"])).toEqual({
      number: "42",
      file: "out.md",
      repo: "MapCairn/mapcairn",
    });
  });

  it("takes a repository option", () => {
    expect(parseArguments(["42", "out.md", "--repo", "a/b"])?.repo).toBe("a/b");
  });

  it.each([[[]], [["42"]], [["x", "out.md"]], [["42", "out.md", "--repo"]]])(
    "refuses %j",
    (args) => {
      expect(parseArguments(args)).toBeUndefined();
    },
  );
});

describe("saveIssueBody", () => {
  it("writes the body byte for byte, with no added newline and CRLF kept", () => {
    const file = target();
    const body = "- [ ] one\r\n- [x] two\nlast line with é and no newline";
    saveIssueBody({ number: "7", file, repo: "a/b" }, (args: string[]) => {
      expect(args).toEqual([
        "issue",
        "view",
        "7",
        "--repo",
        "a/b",
        "--json",
        "body",
      ]);
      return JSON.stringify({ body });
    });
    expect(readFileSync(file, "utf8")).toBe(body);
  });

  it("throws when gh gives no body", () => {
    expect(() =>
      saveIssueBody({ number: "7", file: target(), repo: "a/b" }, () => "{}"),
    ).toThrow(/no body/);
  });
});
