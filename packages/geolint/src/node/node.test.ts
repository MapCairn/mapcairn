// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handle } from "../cli/worker.js";
import { buildContext, LintUsageError } from "../engine/lint.js";
import { rules } from "../engine/rules/index.js";
import { expandInputs, fileChunks, NoMatchError, STDIN } from "./files.js";
import { fixedPathFor, fixFile, planFixInputs } from "./fixFile.js";
import { isFileSystemError, lintFile } from "./lintFile.js";
import { mapInThreads } from "./pool.js";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "geolint-node-"));
  mkdirSync(path.join(dir, "nested"));
  for (const file of [
    "b.geojson",
    "a.geojson",
    "nested/c.geojson",
    "other.txt",
  ]) {
    writeFileSync(path.join(dir, file), '{"type":"Point","coordinates":[1,2]}');
  }
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("expandInputs", () => {
  it("keeps plain paths and - as they are, once each", async () => {
    expect(
      await expandInputs(["x.geojson", STDIN, "x.geojson", STDIN], dir),
    ).toEqual(["x.geojson", STDIN]);
  });

  it("reads a file once however its path is written", async () => {
    const absolute = path.join(dir, "x.geojson");
    expect(
      await expandInputs(
        ["x.geojson", "./x.geojson", absolute, "sub/../x.geojson"],
        dir,
      ),
    ).toEqual(["x.geojson"]);
  });

  it("expands a glob, sorted, and a recursive glob", async () => {
    expect(await expandInputs(["*.geojson"], dir)).toEqual([
      "a.geojson",
      "b.geojson",
    ]);
    expect(await expandInputs(["**/*.geojson"], dir)).toEqual([
      "a.geojson",
      "b.geojson",
      path.join("nested", "c.geojson"),
    ]);
  });

  describe("an argument with glob characters in it", () => {
    let folder: string;
    const point = '{"type":"Point","coordinates":[1,2]}';

    beforeAll(() => {
      folder = path.join(dir, "glob-names");
      mkdirSync(folder);
      for (const name of [
        "a.geojson",
        "b.geojson",
        "data[1].geojson",
        "{a,b}.geojson",
      ]) {
        writeFileSync(path.join(folder, name), point);
      }
    });

    it("is a path when it names a file that exists", async () => {
      for (const name of ["data[1].geojson", "{a,b}.geojson"]) {
        expect(await expandInputs([name], folder)).toEqual([name]);
      }
    });

    it.skipIf(process.platform === "win32")(
      "is a path for a name with * and ?, which Windows does not allow",
      async () => {
        for (const name of ["all*.geojson", "what?.geojson"]) {
          writeFileSync(path.join(folder, name), point);
          expect(await expandInputs([name], folder)).toEqual([name]);
        }
      },
    );

    it("is a glob when nothing of that name exists, and is refused when it matches nothing", async () => {
      expect(await expandInputs(["[ab].geojson"], folder)).toEqual([
        "a.geojson",
        "b.geojson",
      ]);
      await expect(expandInputs(["[xy].geojson"], folder)).rejects.toThrow(
        NoMatchError,
      );
    });
  });

  it("refuses a glob that matches nothing", async () => {
    await expect(expandInputs(["*.nothing"], dir)).rejects.toThrow(
      NoMatchError,
    );
  });
});

describe("fileChunks", () => {
  it("streams the bytes of a file", async () => {
    let size = 0;
    for await (const chunk of fileChunks(path.join(dir, "a.geojson"))) {
      size += chunk.length;
    }
    expect(size).toBe(readFileSync(path.join(dir, "a.geojson")).length);
  });
});

describe("fixedPathFor", () => {
  it("replaces the extension with .fixed.geojson, next to the file", () => {
    expect(fixedPathFor(path.join("a", "data.geojson"))).toBe(
      path.join("a", "data.fixed.geojson"),
    );
    expect(fixedPathFor("data.json")).toBe("data.fixed.geojson");
    expect(fixedPathFor("data")).toBe("data.fixed.geojson");
  });
});

describe("planFixInputs", () => {
  it("keeps the inputs in order and skips the ones that are fixed copies", () => {
    expect(
      planFixInputs(["b.geojson", "a.fixed.geojson", "c.json"], dir),
    ).toEqual({
      inputs: ["b.geojson", "c.json"],
      skipped: ["a.fixed.geojson"],
    });
  });

  it("refuses two inputs that write the same copy and names both", () => {
    expect(() => planFixInputs(["x.geojson", "x.json"], dir)).toThrow(
      /x[.]fixed[.]geojson for both x[.]geojson and x[.]json/,
    );
    expect(() =>
      planFixInputs(["x.geojson", path.join(dir, "x.json")], dir),
    ).toThrow(LintUsageError);
  });

  it("tells files with the same name in different folders apart", () => {
    expect(
      planFixInputs(
        [path.join("a", "x.geojson"), path.join("b", "x.geojson")],
        dir,
      ).inputs,
    ).toHaveLength(2);
  });

  it("sees through a relative and an absolute spelling of the same copy", () => {
    expect(() =>
      planFixInputs(["x.geojson", path.join(dir, "x.json")], dir),
    ).toThrow(/for both/);
  });
});

describe("fixFile", () => {
  it("writes many copies into one folder at once and leaves nothing beside them but the originals", async () => {
    const folder = path.join(dir, "concurrent");
    mkdirSync(folder);
    const names = Array.from({ length: 12 }, (_, index) => `file-${index}`);
    for (const name of names) {
      writeFileSync(
        path.join(folder, `${name}.geojson`),
        '{"type":"Point","coordinates":[1.123456789,2]}',
      );
    }
    const context = await buildContext({});
    const outcomes = await Promise.all(
      names.map((name) =>
        fixFile(path.join(folder, `${name}.geojson`), context, rules),
      ),
    );
    expect(outcomes.map((outcome) => outcome.written)).toEqual(
      names.map((name) => path.join(folder, `${name}.fixed.geojson`)),
    );
    expect(readdirSync(folder).sort()).toEqual(
      names
        .flatMap((name) => [`${name}.fixed.geojson`, `${name}.geojson`])
        .sort(),
    );
  });

  it("writes nothing, and says why, when no feature needed a repair", async () => {
    const folder = path.join(dir, "nothing-to-fix");
    mkdirSync(folder);
    const file = path.join(folder, "ok.geojson");
    writeFileSync(file, '{"type":"Point","coordinates":[1,2]}');
    const outcome = await fixFile(file, await buildContext({}), rules);
    expect(outcome.written).toBeUndefined();
    expect(outcome.problem).toBe("no feature needed a repair");
    expect(readdirSync(folder)).toEqual(["ok.geojson"]);
  });

  it("does not use a temporary name that an earlier run, or another one, may be using", async () => {
    const folder = path.join(dir, "decoy");
    mkdirSync(folder);
    const file = path.join(folder, "d.geojson");
    writeFileSync(file, '{"type":"Point","coordinates":[1,2]}');
    writeFileSync(path.join(folder, "d.fixed.geojson.tmp"), "another run");
    await fixFile(file, await buildContext({}), rules);
    expect(readFileSync(path.join(folder, "d.fixed.geojson.tmp"), "utf8")).toBe(
      "another run",
    );
  });

  it("leaves no work directory after invalid input", async () => {
    const folder = path.join(dir, "invalid-folder");
    mkdirSync(folder);
    writeFileSync(path.join(folder, "bad.geojson"), "{");
    const outcome = await fixFile(
      path.join(folder, "bad.geojson"),
      await buildContext({}),
      rules,
    );
    expect(outcome.written).toBeUndefined();
    expect(readdirSync(folder)).toEqual(["bad.geojson"]);
  });

  it("throws, leaving no work directory, when the copy cannot be moved into place", async () => {
    const folder = path.join(dir, "blocked");
    mkdirSync(folder);
    writeFileSync(
      path.join(folder, "b.geojson"),
      '{"type":"Point","coordinates":[1.123456789,2]}',
    );
    mkdirSync(path.join(folder, "b.fixed.geojson"));
    await expect(
      fixFile(path.join(folder, "b.geojson"), await buildContext({}), rules),
    ).rejects.toThrow();
    expect(readdirSync(folder).sort()).toEqual([
      "b.fixed.geojson",
      "b.geojson",
    ]);
  });

  it("throws, leaving nothing behind, when the folder cannot be written", async () => {
    await expect(
      fixFile(
        path.join(dir, "no-such-folder", "a.geojson"),
        await buildContext({}),
        rules,
      ),
    ).rejects.toThrow(/ENOENT/);
  });

  it("writes the copy for a valid file and removes the temporary file", async () => {
    const file = path.join(dir, "fixable.geojson");
    writeFileSync(file, '{"type":"Point","coordinates":[1.123456789,2]}');
    const context = await buildContext({});
    const outcome = await fixFile(file, context, rules);
    expect(outcome.written).toBe(fixedPathFor(file));
    expect(outcome.stats).toEqual({ features: 1, changed: 1 });
    expect(
      JSON.parse(readFileSync(fixedPathFor(file), "utf8")).coordinates[0],
    ).toBe(1.1234568);
  });

  it("writes a large collection in batches", async () => {
    const file = path.join(dir, "large.geojson");
    const feature = JSON.stringify({
      type: "Feature",
      properties: { p: "x".repeat(900) },
      geometry: { type: "Point", coordinates: [1.123456789, 2] },
    });
    writeFileSync(
      file,
      `{"type":"FeatureCollection","features":[${Array(2500).fill(feature).join(",")}]}`,
    );
    const outcome = await fixFile(file, await buildContext({}), rules);
    expect(outcome.stats.features).toBe(2500);
    expect(
      JSON.parse(readFileSync(fixedPathFor(file), "utf8")).features,
    ).toHaveLength(2500);
  });

  it("reports a problem and writes nothing for invalid JSON", async () => {
    const file = path.join(dir, "invalid.geojson");
    writeFileSync(file, "{");
    const outcome = await fixFile(file, await buildContext({}), rules);
    expect(outcome.written).toBeUndefined();
    expect(outcome.problem).toBeDefined();
  });

  it("reports a missing file as a problem and writes nothing", async () => {
    const outcome = await fixFile(
      path.join(dir, "gone.geojson"),
      await buildContext({}),
      rules,
    );
    expect(outcome.written).toBeUndefined();
    expect(outcome.problem).toContain("ENOENT");
  });
});

describe("isFileSystemError", () => {
  const withCode = (code: string) => Object.assign(new Error(code), { code });

  it("is true for the errors that mean the file cannot be read", () => {
    for (const code of [
      "ENOENT",
      "EISDIR",
      "EACCES",
      "EPERM",
      "ENOTDIR",
      "ELOOP",
      "ENAMETOOLONG",
    ]) {
      expect(isFileSystemError(withCode(code)), code).toBe(true);
    }
  });

  it("is false for an error about the run, such as too many open files, and for anything else", () => {
    expect(isFileSystemError(withCode("EMFILE"))).toBe(false);
    expect(isFileSystemError(withCode("ENFILE"))).toBe(false);
    expect(isFileSystemError(withCode("ENOSPC"))).toBe(false);
    expect(isFileSystemError(new Error("no code"))).toBe(false);
    expect(isFileSystemError({ code: "ENOENT" })).toBe(false);
    expect(isFileSystemError(undefined)).toBe(false);
  });
});

describe("lintFile", () => {
  const task = (file: string) => ({
    file,
    path: path.join(dir, file),
    regions: [],
    ignore: [],
    fix: false,
  });

  it("lints a file", async () => {
    const result = await lintFile(task("a.geojson"));
    expect(result.report.featureCount).toBe(1);
    expect(result.notes).toEqual([]);
  });

  it("turns a missing file or a directory into an input error", async () => {
    expect(
      (await lintFile(task("gone.geojson"))).report.inputError,
    ).toBeDefined();
    expect((await lintFile(task("nested"))).report.inputError).toBeDefined();
  });

  it("turns a file system failure while writing the fixed copy into an input error too", async () => {
    const result = await lintFile({
      ...task(path.join("no-such-folder", "a.geojson")),
      fix: true,
    });
    expect(result.file).toBe(path.join("no-such-folder", "a.geojson"));
    expect(result.report.inputError?.message).toContain("ENOENT");
    expect(result.report.featureCount).toBe(0);
  });

  it("does not hide an error that is not a file system error", async () => {
    await expect(
      lintFile({ ...task("a.geojson"), ignore: ["no-such-rule"] }),
    ).rejects.toThrow(/Unknown rule/);
  });
});

describe("the worker's handler", () => {
  it("answers with the report", async () => {
    const reply = await handle({
      index: 4,
      input: {
        file: "a.geojson",
        path: path.join(dir, "a.geojson"),
        regions: [],
        ignore: [],
        fix: false,
      },
    });
    expect(reply).toMatchObject({
      index: 4,
      output: { report: { featureCount: 1 } },
    });
  });

  it("answers with a failure message when the lint throws", async () => {
    const reply = await handle({
      index: 1,
      input: {
        file: "x",
        path: "x",
        regions: [],
        ignore: ["nope"],
        fix: false,
      },
    });
    expect(reply).toMatchObject({
      index: 1,
      failure: expect.stringContaining("Unknown rule"),
    });
  });
});

describe("mapInThreads", () => {
  function worker(name: string, body: string): URL {
    const file = path.join(dir, name);
    writeFileSync(
      file,
      `import { parentPort } from "node:worker_threads";\nparentPort.on("message", (request) => {\n${body}\n});\n`,
    );
    return pathToFileURL(file);
  }

  it("returns outputs in input order, whichever finishes first", async () => {
    const url = worker(
      "echo.mjs",
      "setTimeout(() => parentPort.postMessage({ index: request.index, output: request.input * 2 }), request.input === 1 ? 60 : 0);",
    );
    expect(await mapInThreads<number, number>(url, [1, 2, 3, 4, 5], 3)).toEqual(
      [2, 4, 6, 8, 10],
    );
  });

  it("uses no more threads than there are inputs, and returns at once for none", async () => {
    const url = worker(
      "echo2.mjs",
      "parentPort.postMessage({ index: request.index, output: request.input });",
    );
    expect(await mapInThreads<number, number>(url, [7], 8)).toEqual([7]);
    expect(await mapInThreads<number, number>(url, [], 4)).toEqual([]);
  });

  it("rejects when a worker answers with a failure", async () => {
    const url = worker(
      "fail.mjs",
      'parentPort.postMessage({ index: request.index, failure: "it broke" });',
    );
    await expect(mapInThreads(url, [1, 2], 2)).rejects.toThrow("it broke");
  });

  it("rejects when a worker throws, and when one exits early", async () => {
    const throws = worker("throws.mjs", 'throw new Error("boom");');
    await expect(mapInThreads(throws, [1], 1)).rejects.toThrow("boom");
    const exits = worker("exits.mjs", "process.exit(3);");
    await expect(mapInThreads(exits, [1], 1)).rejects.toThrow(/exit code 3/);
  });
});
