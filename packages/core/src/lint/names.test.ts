// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FORBIDDEN,
  findForbidden,
  hashWord,
  isScannable,
  runCli,
  tokensOf,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/names-check.mjs";

/** Made-up words: none is a real name, so this file holds nothing the check forbids. */
const LONG_WORD = "examplename";
const SHORT_WORD = "tiny";

interface Entry {
  hash: string;
  length: number;
  whole: boolean;
}

function entry(word: string, whole: boolean): Entry {
  return {
    hash: createHash("sha256").update(word).digest("hex"),
    length: Array.from(word).length,
    whole,
  };
}

const LIST: Entry[] = [entry(LONG_WORD, false), entry(SHORT_WORD, true)];

const TAG_CHARACTERS = String.fromCodePoint(0xe0041, 0xe0042, 0xe007f);

describe("tokensOf", () => {
  it("lower-cases and splits into runs of letters and digits", () => {
    expect(tokensOf("Hello, World-42 (v2)!")).toEqual([
      "hello",
      "world",
      "42",
      "v2",
    ]);
  });

  it("removes accents and compatibility forms", () => {
    expect(tokensOf("Éxamplé ｆｕｌｌｗｉｄｔｈ")).toEqual([
      "example",
      "fullwidth",
    ]);
  });

  it("joins a word broken by invisible or direction-changing characters", () => {
    expect(tokensOf("ex​am‮ple⁦x⁩")).toEqual(["examplex"]);
    expect(tokensOf(`ex${TAG_CHARACTERS}am­ple︎`)).toEqual(["example"]);
  });

  it("returns nothing for empty or punctuation-only text", () => {
    expect(tokensOf("")).toEqual([]);
    expect(tokensOf(" -- ... ")).toEqual([]);
  });
});

describe("findForbidden", () => {
  it("returns the 1-based lines that hold a name, and never the name", () => {
    const text = ["fine", `a ${LONG_WORD} b`, "fine", `${SHORT_WORD}`].join(
      "\n",
    );
    const lines = findForbidden(text, LIST);
    expect(lines).toEqual([2, 4]);
    expect(JSON.stringify(lines)).not.toContain(LONG_WORD);
  });

  it("lists a line once however many names it holds", () => {
    expect(
      findForbidden(`${LONG_WORD} ${SHORT_WORD} ${LONG_WORD}`, LIST),
    ).toEqual([1]);
  });

  it("counts lines the same for CRLF and CR line ends", () => {
    expect(findForbidden(`a\r\n${LONG_WORD}\r\nb`, LIST)).toEqual([2]);
    expect(findForbidden(`a\r${LONG_WORD}`, LIST)).toEqual([2]);
  });

  it("finds a whole-token word only as a whole token", () => {
    expect(findForbidden(SHORT_WORD, LIST)).toEqual([1]);
    expect(findForbidden(`my-${SHORT_WORD}-house`, LIST)).toEqual([1]);
    expect(findForbidden(`${SHORT_WORD}house`, LIST)).toEqual([]);
    expect(findForbidden(`the${SHORT_WORD}`, LIST)).toEqual([]);
    expect(findForbidden(`${SHORT_WORD}s`, LIST)).toEqual([]);
  });

  it("finds a substring word inside a longer token", () => {
    expect(findForbidden(`my${LONG_WORD}here`, LIST)).toEqual([1]);
    expect(findForbidden(`${LONG_WORD}2`, LIST)).toEqual([1]);
    expect(findForbidden(`get_${LONG_WORD}_value`, LIST)).toEqual([1]);
    expect(findForbidden(`${LONG_WORD.slice(1)}`, LIST)).toEqual([]);
  });

  it("is not fooled by case", () => {
    expect(findForbidden(LONG_WORD.toUpperCase(), LIST)).toEqual([1]);
    expect(findForbidden("ExampleName", LIST)).toEqual([1]);
    expect(findForbidden(SHORT_WORD.toUpperCase(), LIST)).toEqual([1]);
  });

  it("is not fooled by accents or full-width letters", () => {
    expect(findForbidden("éxamplé nâme".replace(" ", ""), LIST)).toEqual([1]);
    expect(findForbidden("ｅｘａｍｐｌｅｎａｍｅ", LIST)).toEqual([1]);
  });

  it("is not fooled by zero-width, direction or tag characters", () => {
    const zeroWidth = `exam​ple​name`;
    const bidirectional = `exam‮ple⁦name⁩`;
    const tagged = `exam${TAG_CHARACTERS}plename`;
    const softHyphen = `exam­plename`;
    const variation = `exam︎plename`;
    for (const text of [
      zeroWidth,
      bidirectional,
      tagged,
      softHyphen,
      variation,
    ]) {
      expect(findForbidden(text, LIST)).toEqual([1]);
    }
    expect(findForbidden(`ti​ny`, LIST)).toEqual([1]);
  });

  it("finds a name inside an HTML comment, because the comment is still in the file", () => {
    expect(findForbidden(`<!-- ${LONG_WORD} -->`, LIST)).toEqual([1]);
  });

  it("passes clean text and empty input", () => {
    expect(findForbidden("Nothing to see here.\nOr here: 42.", LIST)).toEqual(
      [],
    );
    expect(findForbidden("", LIST)).toEqual([]);
    expect(findForbidden("anything", [])).toEqual([]);
  });

  it("stays fast on a very long token", () => {
    const started = Date.now();
    expect(findForbidden("a".repeat(200_000), LIST)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("the shipped list", () => {
  it("holds only hashes, lengths and flags", () => {
    expect(FORBIDDEN.length).toBeGreaterThan(0);
    for (const item of FORBIDDEN) {
      expect(Object.keys(item).sort()).toEqual(["hash", "length", "whole"]);
      expect(item.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(item.length)).toBe(true);
      expect(item.length).toBeGreaterThan(0);
      expect(typeof item.whole).toBe("boolean");
    }
  });

  it("finds nothing in ordinary prose", () => {
    expect(
      findForbidden("The map shows a route and a pin.", FORBIDDEN),
    ).toEqual([]);
  });
});

describe("hashWord", () => {
  it("returns the hash and the length of one word, normalised like the check", () => {
    expect(hashWord("ExampleName")).toEqual({
      hash: entry(LONG_WORD, false).hash,
      length: LONG_WORD.length,
    });
  });

  it("refuses text that is not exactly one word", () => {
    expect(hashWord("two words")).toBeNull();
    expect(hashWord("")).toBeNull();
    expect(hashWord("--")).toBeNull();
  });
});

describe("isScannable", () => {
  it("skips binary files and the lockfile, and keeps text", () => {
    expect(isScannable("docs/readme.md")).toBe(true);
    expect(isScannable("scripts/a.mjs")).toBe(true);
    expect(isScannable("public/logo.PNG")).toBe(false);
    expect(isScannable("fonts/a.woff2")).toBe(false);
    expect(isScannable("package-lock.json")).toBe(false);
    expect(isScannable("examples/embed/package-lock.json")).toBe(false);
    expect(isScannable("docs/package-lock.md")).toBe(true);
  });
});

describe("runCli", () => {
  let dir: string;
  let clean: string;
  let dirty: string;
  let binary: string;
  let messageFile: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "names-check-"));
    clean = join(dir, "clean.md");
    dirty = join(dir, "dirty.md");
    binary = join(dir, "picture.png");
    messageFile = join(dir, "COMMIT_EDITMSG");
    mkdirSync(join(dir, "folder"));
    writeFileSync(clean, "Nothing here.\n");
    writeFileSync(dirty, `line one\nline two ${LONG_WORD}\nline three\n`);
    writeFileSync(binary, `${LONG_WORD}\n`);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Runs the command line with fakes and returns what it printed. */
  function run(
    argv: string[],
    options: {
      env?: Record<string, string>;
      stdin?: string;
      files?: string[];
      gh?: (args: string[]) => { status: number | null; stdout: string };
    } = {},
  ) {
    const out: string[] = [];
    const err: string[] = [];
    const code = runCli(argv, {
      list: LIST,
      env: options.env ?? {},
      readStdin: () => options.stdin ?? "",
      trackedFiles: () => options.files ?? [],
      runGh: options.gh ?? (() => ({ status: 1, stdout: "" })),
      log: (line: string) => out.push(line),
      error: (line: string) => err.push(line),
    });
    return { code, out, err, all: [...out, ...err].join("\n") };
  }

  function expectNoLeak(all: string) {
    expect(all).not.toContain(LONG_WORD);
    expect(all).not.toContain(SHORT_WORD);
    expect(all).not.toContain(entry(LONG_WORD, false).hash);
    expect(all).not.toContain(entry(SHORT_WORD, true).hash);
  }

  describe("files", () => {
    it("is the default mode and exits 0 when every file is clean", () => {
      const result = run([], { files: [clean] });
      expect(result.code).toBe(0);
      expect(result.all).toBe("");
    });

    it("prints path:line and never the name, then exits 1", () => {
      const result = run(["files"], { files: [clean, dirty] });
      expect(result.code).toBe(1);
      expect(result.err).toEqual([`${dirty}:2: a forbidden name`]);
      expectNoLeak(result.all);
    });

    it("skips binary files, directories and files that are gone", () => {
      const result = run(["files"], {
        files: [binary, join(dir, "folder"), join(dir, "missing.md"), clean],
      });
      expect(result.code).toBe(0);
    });

    it("finds a name in a file name without printing the file name", () => {
      const named = join(dir, `${LONG_WORD}.md`);
      writeFileSync(named, "clean\n");
      const result = run(["files"], { files: [clean, named] });
      expect(result.code).toBe(1);
      expect(result.err).toEqual(["file name 2: a forbidden name"]);
      expectNoLeak(result.all);
    });
  });

  describe("message", () => {
    it("scans a commit message file and ignores comment lines and the diff after the scissors line", () => {
      writeFileSync(
        messageFile,
        [
          "feat: add a thing",
          "",
          `# ${LONG_WORD} in a comment git removes`,
          "Body line",
          `${LONG_WORD} in the body`,
          "# ------------------------ >8 ------------------------",
          `+${LONG_WORD} in the diff`,
        ].join("\n"),
      );
      const result = run(["message", messageFile]);
      expect(result.code).toBe(1);
      expect(result.err).toEqual([`${messageFile}:5: a forbidden name`]);
      expectNoLeak(result.all);
    });

    it("exits 0 for a clean message", () => {
      writeFileSync(messageFile, "fix: a bug\n\nBody.\n");
      expect(run(["message", messageFile]).code).toBe(0);
    });

    it("exits 2 with a usage line when the path is missing or unreadable", () => {
      expect(run(["message"]).code).toBe(2);
      const result = run(["message", join(dir, "nope")]);
      expect(result.code).toBe(2);
      expectNoLeak(result.all);
    });
  });

  describe("text", () => {
    it("reads the title and body from the environment and commit messages from standard input", () => {
      const result = run(["text"], {
        env: {
          PR_TITLE: `feat: ${LONG_WORD}`,
          PR_BODY: `fine\n\nbad ${SHORT_WORD}\n`,
        },
        stdin: `commit one\n\n${LONG_WORD}\n`,
      });
      expect(result.code).toBe(1);
      expect(result.err).toEqual([
        "pull request title:1: a forbidden name",
        "pull request body:3: a forbidden name",
        "commit messages:3: a forbidden name",
      ]);
      expectNoLeak(result.all);
    });

    it("exits 0 for clean text and treats missing variables as empty", () => {
      expect(
        run(["text"], {
          env: { PR_TITLE: "feat: a thing", PR_BODY: "Fixes #1" },
          stdin: "feat: a thing\n",
        }).code,
      ).toBe(0);
      expect(run(["text"]).code).toBe(0);
    });
  });

  describe("github", () => {
    type Rows = Record<string, unknown[]>;

    /** A fake `gh` that answers each endpoint with one JSON object per line. */
    function fakeGh(rows: Rows, failOn?: string) {
      return (args: string[]) => {
        const path = args[1] ?? "";
        if (failOn && path.includes(failOn)) {
          return { status: 1, stdout: "" };
        }
        const key = Object.keys(rows).find((name) => path.includes(name));
        const found = key ? (rows[key] ?? []) : [];
        return {
          status: 0,
          stdout: found.map((row) => JSON.stringify(row)).join("\n"),
        };
      };
    }

    const quiet: Rows = {
      "/issues?": [{ label: "#1", parts: { title: "t", body: "b" } }],
      "/issues/comments": [{ label: "#1", parts: { comment: "ok" } }],
      "/pulls/comments": [{ label: "#2", parts: { "review comment": "ok" } }],
      "/pulls?": [{ number: 2 }],
      "/pulls/2/reviews": [{ label: "#2", parts: { review: "ok" } }],
      "/releases": [{ label: "release 9", parts: { name: "n", body: "b" } }],
    };

    it("reports the counts and exits 0 when nothing is found", () => {
      const result = run(["github"], { gh: fakeGh(quiet) });
      expect(result.code).toBe(0);
      expect(result.out).toEqual(["github: scanned 5 items, 0 findings"]);
    });

    it("prints where a name is, never the name, and exits 1", () => {
      const rows: Rows = {
        ...quiet,
        "/issues?": [
          {
            label: "#1",
            parts: { title: `a ${LONG_WORD}`, body: `x\n${SHORT_WORD}` },
          },
        ],
        "/pulls/2/reviews": [
          { label: "#2", parts: { review: `${LONG_WORD}` } },
        ],
        "/releases": [{ label: "release 9", parts: { body: "" } }],
      };
      const result = run(["github"], { gh: fakeGh(rows) });
      expect(result.code).toBe(1);
      expect(result.err).toEqual([
        "#1 title:1: a forbidden name",
        "#1 body:2: a forbidden name",
        "#2 review:1: a forbidden name",
      ]);
      expect(result.out).toEqual(["github: scanned 5 items, 3 findings"]);
      expectNoLeak(result.all);
    });

    it("never reads a failed request as a clean result", () => {
      const result = run(["github"], { gh: fakeGh(quiet, "/releases") });
      expect(result.code).toBe(2);
      expect(result.err.join("\n")).toContain("a request to GitHub failed");
    });

    it("never reads an answer that is not JSON as a clean result", () => {
      const result = run(["github"], {
        gh: () => ({ status: 0, stdout: "not json" }),
      });
      expect(result.code).toBe(2);
    });

    it("only reads: every call is a GET through gh api", () => {
      const calls: string[][] = [];
      run(["github"], {
        gh: (args) => {
          calls.push(args);
          return fakeGh(quiet)(args);
        },
      });
      expect(calls.length).toBeGreaterThan(0);
      for (const args of calls) {
        expect(args[0]).toBe("api");
        expect(args).toContain("--paginate");
        expect(args).not.toContain("--method");
        expect(args).not.toContain("-X");
        expect(args).not.toContain("-f");
        expect(args).not.toContain("-F");
      }
    });
  });

  describe("hash", () => {
    it("prints the hash and the length, and is the only mode that does", () => {
      const result = run(["hash", "ExampleName"]);
      expect(result.code).toBe(0);
      expect(result.out).toEqual([
        `${entry(LONG_WORD, false).hash} ${LONG_WORD.length}`,
      ]);
    });

    it("exits 2 for anything but one word", () => {
      expect(run(["hash"]).code).toBe(2);
      expect(run(["hash", "two words"]).code).toBe(2);
    });
  });

  it("exits 2 with a usage line for an unknown mode", () => {
    const result = run(["nonsense"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("usage:");
  });
});
