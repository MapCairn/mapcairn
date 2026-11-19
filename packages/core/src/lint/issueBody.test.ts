// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  main,
  parseArguments,
  saveIssueBody,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/issue-body.mjs";

const folders: string[] = [];

function scratch(): string {
  const folder = mkdtempSync(path.join(tmpdir(), "mapcairn-body-"));
  folders.push(folder);
  return folder;
}

function target(): string {
  return path.join(scratch(), "body.md");
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("parseArguments", () => {
  it("reads the number and the file, with the project repository by default", () => {
    expect(parseArguments(["42", "out.md"])).toEqual({
      number: "42",
      file: "out.md",
      repo: "MapCairn/mapcairn",
      force: false,
    });
  });

  it("takes a force flag before or after the repository option", () => {
    expect(parseArguments(["42", "out.md", "--force"])?.force).toBe(true);
    expect(
      parseArguments(["42", "out.md", "--force", "--repo", "a/b"]),
    ).toMatchObject({ force: true, repo: "a/b" });
  });

  it("takes a repository option", () => {
    expect(parseArguments(["42", "out.md", "--repo", "a/b"])?.repo).toBe("a/b");
  });

  it.each([
    [[]],
    [["42"]],
    [["x", "out.md"]],
    [["42", "out.md", "--repo"]],
    [["42", "out.md", "--repo", "a/b", "extra"]],
    [["42", "out.md", "extra"]],
    [["42", "out.md", "--unknown"]],
  ])("refuses %j", (args) => {
    expect(parseArguments(args)).toBeUndefined();
  });
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

describe("saveIssueBody overwriting", () => {
  const request = (file: string, force: boolean) => ({
    number: "7",
    file,
    repo: "a/b",
    force,
  });
  const run = () => JSON.stringify({ body: "new" });

  it("refuses to overwrite an existing file and leaves it unchanged", () => {
    const file = target();
    writeFileSync(file, "old", "utf8");
    expect(() => saveIssueBody(request(file, false), run)).toThrow(/--force/);
    expect(readFileSync(file, "utf8")).toBe("old");
  });

  it("overwrites an existing file with --force", () => {
    const file = target();
    writeFileSync(file, "old", "utf8");
    saveIssueBody(request(file, true), run);
    expect(readFileSync(file, "utf8")).toBe("new");
  });

  it("does not hide other write errors", () => {
    const file = path.join(scratch(), "missing", "body.md");
    expect(() => saveIssueBody(request(file, false), run)).toThrow(/ENOENT/);
  });
});

describe("main", () => {
  function runMain(args: string[], run: () => string) {
    const errors: string[] = [];
    const code = main(args, run, (line: string) => errors.push(line));
    return { code, errors };
  }

  it("returns 0 and writes the file", () => {
    const file = target();
    const { code, errors } = runMain(["7", file], () =>
      JSON.stringify({ body: "b" }),
    );
    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe("b");
  });

  it("returns 2 with the usage line for bad arguments", () => {
    const { code, errors } = runMain(["7"], () => "{}");
    expect(code).toBe(2);
    expect(errors[0]).toMatch(/^usage: .*--force/);
  });

  it("returns 1 with the reason when saving fails", () => {
    const { code, errors } = runMain(["7", target()], () => {
      throw new Error("gh is down");
    });
    expect(code).toBe(1);
    expect(errors).toEqual(["issue-body: gh is down"]);
  });
});

const script = fileURLToPath(
  new URL("../../../../scripts/agents/issue-body.mjs", import.meta.url),
);

function runScript(args: string[], pathDirectory: string) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: pathDirectory, Path: pathDirectory },
  });
}

/** A folder holding a fake `gh` that fails for issue 404 and returns a body otherwise. */
function fakeGh(): string {
  const bin = scratch();
  const fake = path.join(bin, "gh");
  writeFileSync(
    fake,
    `#!${process.execPath}\n` +
      `if (process.argv.includes("404")) { console.error("no such issue"); process.exit(1); }\n` +
      `console.log(JSON.stringify({ body: "from gh" }));\n`,
  );
  chmodSync(fake, 0o755);
  return bin;
}

describe("command line", () => {
  it("exits 2 with the usage line for an extra argument after --repo", () => {
    const result = runScript(
      ["7", target(), "--repo", "a/b", "extra"],
      target(),
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^usage: /);
  });

  it("exits 1 and names the cause when gh is not installed", () => {
    const result = runScript(["7", target()], scratch());
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^issue-body: .*ENOENT/);
  });

  it.skipIf(process.platform === "win32")(
    "exits 1 with gh's own message when gh fails",
    () => {
      const result = runScript(["404", target()], fakeGh());
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("issue-body: no such issue\n");
    },
  );

  it.skipIf(process.platform === "win32")(
    "exits 0 and writes the file when gh works, then refuses to overwrite it",
    () => {
      const file = target();
      const bin = fakeGh();
      expect(runScript(["7", file], bin).status).toBe(0);
      expect(readFileSync(file, "utf8")).toBe("from gh");

      const again = runScript(["7", file], bin);
      expect(again.status).toBe(1);
      expect(again.stderr).toMatch(/--force/);
      expect(runScript(["7", file, "--force"], bin).status).toBe(0);
    },
  );
});
