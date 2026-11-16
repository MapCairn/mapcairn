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
import { FORMATS, formatRules, main } from "./main.js";

const point = (coordinates: number[]) => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Point", coordinates },
});
const collection = (...features: unknown[]) =>
  JSON.stringify({ type: "FeatureCollection", features });

const CLEAN = collection(point([18.4, -33.9]));
/** A closed ring that runs clockwise: a warning, nothing worse. */
const CLOCKWISE = collection({
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    ],
  },
});
/** A bow-tie: a ring that crosses itself, an error. */
const BOWTIE = collection({
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0.5, 0.5],
        [1.5, 1.5],
        [1.5, 0.5],
        [0.5, 1.5],
        [0.5, 0.5],
      ],
    ],
  },
});

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

describe("the command", () => {
  let dir: string;

  async function run(args: string[], stdin = ""): Promise<Run> {
    let out = "";
    let err = "";
    const code = await main(args, {
      stdout: {
        write: (text) => {
          out += text;
        },
      },
      stderr: {
        write: (text) => {
          err += text;
        },
      },
      stdin: () =>
        (async function* () {
          yield new TextEncoder().encode(stdin);
        })(),
      cwd: dir,
    });
    return { code, out, err };
  }

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "geolint-cli-"));
    writeFileSync(path.join(dir, "clean.geojson"), CLEAN);
    writeFileSync(path.join(dir, "clockwise.geojson"), CLOCKWISE);
    writeFileSync(path.join(dir, "bowtie.geojson"), BOWTIE);
    writeFileSync(
      path.join(dir, "broken.geojson"),
      '{"type":"FeatureCollection","features":[',
    );
    mkdirSync(path.join(dir, "many"));
    for (const name of ["b", "a", "c"]) {
      writeFileSync(path.join(dir, "many", `${name}.geojson`), BOWTIE);
    }
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("information", () => {
    it("prints help and exits 0", async () => {
      const result = await run(["--help"]);
      expect(result.code).toBe(0);
      expect(result.out).toContain("Usage: geolint");
    });

    it("lists the rules with --rules", async () => {
      const result = await run(["--rules"]);
      expect(result.code).toBe(0);
      expect(result.out).toBe(formatRules());
      expect(result.out).toContain("winding-order");
      expect(result.out).toContain("fixable");
    });
  });

  describe("exit codes", () => {
    it("is 0 for a clean file", async () => {
      const result = await run(["clean.geojson"]);
      expect(result.code).toBe(0);
      expect(result.out).toContain("0 errors, 0 warnings");
    });

    it("is 1 for warnings only", async () => {
      expect((await run(["clockwise.geojson"])).code).toBe(1);
    });

    it("is 2 for an error", async () => {
      const result = await run(["bowtie.geojson"]);
      expect(result.code).toBe(2);
      expect(result.out).toContain("self-intersection");
    });

    it("is 3 for a missing file, invalid JSON and no input", async () => {
      expect((await run(["missing.geojson"])).code).toBe(3);
      const broken = await run(["broken.geojson"]);
      expect(broken.code).toBe(3);
      expect(broken.out).toContain("invalid-input");
      const none = await run([]);
      expect(none.code).toBe(3);
      expect(none.err).toContain("no input given");
    });

    it("is 3 for a request it cannot understand, and says why on standard error", async () => {
      for (const [args, message] of [
        [["--nope", "clean.geojson"], "Unknown option"],
        [["--format", "xml", "clean.geojson"], "Unknown format xml"],
        [["--jobs", "0", "clean.geojson"], "--jobs needs"],
        [["--jobs", "x", "clean.geojson"], "--jobs needs"],
        [["--ignore", "no-such-rule", "clean.geojson"], "Unknown rule id"],
        [["--region", "QQ", "clean.geojson"], "No outline for region QQ"],
        [["nothing/*.geojson"], "No file matches"],
        [["--fix", "-"], "cannot be used with standard input"],
      ] as const) {
        const result = await run([...args]);
        expect(result.code).toBe(3);
        expect(result.err).toContain(message);
      }
    });
  });

  describe("formats", () => {
    it("knows text, json and sarif", () => {
      expect(FORMATS).toEqual(["text", "json", "sarif"]);
    });

    it("writes JSON with a summary", async () => {
      const parsed = JSON.parse(
        (await run(["--format", "json", "bowtie.geojson"])).out,
      );
      expect(parsed.version).toBe(1);
      expect(parsed.files[0].file).toBe("bowtie.geojson");
      expect(parsed.summary.errors).toBeGreaterThan(0);
    });

    it("writes SARIF", async () => {
      const parsed = JSON.parse(
        (await run(["--format", "sarif", "bowtie.geojson"])).out,
      );
      expect(parsed.version).toBe("2.1.0");
      expect(parsed.runs[0].results.length).toBeGreaterThan(0);
    });
  });

  describe("inputs", () => {
    it("reads standard input with -", async () => {
      const result = await run(["-"], BOWTIE);
      expect(result.code).toBe(2);
      expect(result.out).toContain("<stdin>:");
    });

    it("expands a glob in sorted order, and the order follows the arguments", async () => {
      const result = await run([
        "--jobs",
        "1",
        "many/*.geojson",
        "clean.geojson",
      ]);
      const files = [...result.out.matchAll(/^(\S+\.geojson):/gm)].map(
        (match) => match[1],
      );
      const firstSeen = [...new Set(files)];
      expect(firstSeen).toEqual([
        path.join("many", "a.geojson"),
        path.join("many", "b.geojson"),
        path.join("many", "c.geojson"),
      ]);
    });

    it("lints a file given twice once", async () => {
      const result = await run(["bowtie.geojson", "bowtie.geojson"]);
      expect(result.out).toContain("in 1 file.");
    });
  });

  describe("options", () => {
    it("leaves out an ignored rule", async () => {
      const result = await run([
        "--ignore",
        "self-intersection",
        "--ignore",
        "winding-order",
        "bowtie.geojson",
      ]);
      expect(result.out).not.toContain("self-intersection");
    });

    it("accepts a region and checks it", async () => {
      expect((await run(["--region", "za", "clean.geojson"])).code).toBe(0);
    });

    it("lints several files in worker threads and keeps the order of the arguments", async () => {
      const workerFile = path.join(dir, "fake-worker.mjs");
      writeFileSync(
        workerFile,
        [
          'import { parentPort } from "node:worker_threads";',
          'parentPort.on("message", ({ index, input }) => {',
          "  const delay = input.file.startsWith('slow') ? 80 : 0;",
          "  setTimeout(() => parentPort.postMessage({ index, output: { file: input.file, report: { findings: [], featureCount: index, inputError: undefined } } }), delay);",
          "});",
        ].join("\n"),
      );
      let out = "";
      const code = await main(
        ["--jobs", "3", "--format", "json", "slow-a", "b", "c", "slow-d"],
        {
          stdout: {
            write: (text) => {
              out += text;
            },
          },
          stderr: { write: () => undefined },
          stdin: () => (async function* () {})(),
          cwd: dir,
          workerUrl: pathToFileURL(workerFile),
        },
      );
      expect(code).toBe(0);
      const files = JSON.parse(out).files.map(
        (entry: { file: string; featureCount: number }) => [
          entry.file,
          entry.featureCount,
        ],
      );
      expect(files).toEqual([
        ["slow-a", 0],
        ["b", 1],
        ["c", 2],
        ["slow-d", 3],
      ]);
    });
  });

  describe("--fix", () => {
    it("writes <name>.fixed.geojson, never changes the original, and reports what is left", async () => {
      const original = collection({
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
            ],
          ],
        },
      });
      writeFileSync(path.join(dir, "fixme.geojson"), original);
      const result = await run(["--fix", "fixme.geojson"]);
      expect(readFileSync(path.join(dir, "fixme.geojson"), "utf8")).toBe(
        original,
      );
      const fixed = JSON.parse(
        readFileSync(path.join(dir, "fixme.fixed.geojson"), "utf8"),
      );
      expect(fixed.features[0].geometry.coordinates[0]).toHaveLength(5);
      expect(result.err).toContain("wrote");
      expect(result.err).toContain("1 of 1 features changed");
      expect(result.code).toBe(0);
      expect(result.out).toContain("fixme.fixed.geojson");
    });

    it("says nothing was written for invalid input, leaves no partial file, and still exits 3", async () => {
      const result = await run(["--fix", "broken.geojson"]);
      expect(result.code).toBe(3);
      expect(result.err).toContain("nothing written");
      expect(() =>
        readFileSync(path.join(dir, "broken.fixed.geojson")),
      ).toThrow();
      expect(() =>
        readFileSync(path.join(dir, "broken.fixed.geojson.tmp")),
      ).toThrow();
    });
  });
});
