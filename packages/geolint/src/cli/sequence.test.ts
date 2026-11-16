// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { main } from "./main.js";

const watch = vi.hoisted(() => ({ active: 0, peak: 0, calls: 0 }));

vi.mock("../node/lintFile.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../node/lintFile.js")>();
  return {
    ...actual,
    lintFile: async (task: Parameters<typeof actual.lintFile>[0]) => {
      watch.active += 1;
      watch.calls += 1;
      watch.peak = Math.max(watch.peak, watch.active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return await actual.lintFile(task);
      } finally {
        watch.active -= 1;
      }
    },
  };
});

describe("linting without worker threads", () => {
  let dir: string;
  const names = ["a", "b", "c", "d", "e"].map((name) => `${name}.geojson`);

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "geolint-sequence-"));
    for (const name of names) {
      writeFileSync(
        path.join(dir, name),
        '{"type":"Point","coordinates":[18.4,-33.9]}',
      );
    }
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("opens one file at a time with --jobs 1, so a long list cannot run out of file handles", async () => {
    const code = await main(["--jobs", "1", ...names], {
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      stdin: () => (async function* () {})(),
      cwd: dir,
      workerUrl: new URL("./no-worker.mjs", import.meta.url),
    });
    expect(code).toBe(0);
    expect(watch.calls).toBe(names.length);
    expect(watch.peak).toBe(1);
  });
});
