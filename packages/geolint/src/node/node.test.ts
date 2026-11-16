// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handle } from "../cli/worker.js";
import { buildContext } from "../engine/lint.js";
import { rules } from "../engine/rules/index.js";
import { expandInputs, fileChunks, NoMatchError, STDIN } from "./files.js";
import { fixedPathFor, fixFile } from "./fixFile.js";
import { lintFile } from "./lintFile.js";
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

describe("fixFile", () => {
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
      geometry: null,
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
