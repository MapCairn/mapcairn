// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `@turf/jsts` is about 385 KB before minification and only the buffer, merge,
 * intersect and cut shape operations need it. An app that composes the
 * interface with the fakes, as `examples/embed` does, must not load it up
 * front. The test bundles the whole `@mapcairn/core` entry the way an app's
 * production build does, and reads which modules land in the chunks that load
 * eagerly.
 */

const CORE_ENTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../index.ts",
);
const JSTS = "@turf/jsts";
const SECOND = 1000;
const BUILD_TIMEOUT = 60 * SECOND;

const scratch = mkdtempSync(path.join(tmpdir(), "mapcairn-eager-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface Chunk {
  readonly type: string;
  readonly fileName: string;
  readonly isEntry?: boolean;
  readonly moduleIds?: readonly string[];
  readonly imports?: readonly string[];
}

async function buildApp(source: string): Promise<readonly Chunk[]> {
  const entry = path.join(scratch, "entry.ts");
  writeFileSync(entry, source);
  const { build } = await import("vite");
  const result = await build({
    root: scratch,
    logLevel: "silent",
    configFile: false,
    build: { write: false, minify: false, rolldownOptions: { input: entry } },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((output) =>
    "output" in output ? (output.output as readonly Chunk[]) : [],
  );
}

/** The entry chunk and every chunk it imports statically. */
function eagerChunks(chunks: readonly Chunk[]): readonly Chunk[] {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const seen = new Set<Chunk>();
  const visit = (chunk: Chunk | undefined): void => {
    if (chunk === undefined || chunk.type !== "chunk" || seen.has(chunk)) {
      return;
    }
    seen.add(chunk);
    for (const name of chunk.imports ?? []) {
      visit(byName.get(name));
    }
  };
  for (const chunk of chunks.filter((entry) => entry.isEntry === true)) {
    visit(chunk);
  }
  return [...seen];
}

function nameOf(chunk: Chunk): string {
  return chunk.fileName;
}

function holdsJsts(chunk: Chunk): boolean {
  return (chunk.moduleIds ?? []).some((id) => id.includes(JSTS));
}

describe("the eager chunk of an app that uses the fakes", () => {
  it(
    "holds no @turf/jsts until a shape operation needs it",
    async () => {
      const chunks = await buildApp(
        `import { createFakeServices } from ${JSON.stringify(CORE_ENTRY)};\nconsole.log(createFakeServices());\n`,
      );
      const eager = eagerChunks(chunks);
      expect(eager.length).toBeGreaterThan(0);
      expect(eager.every((chunk) => (chunk.moduleIds ?? []).length > 0)).toBe(
        true,
      );
      expect(eager.filter(holdsJsts).map(nameOf)).toEqual([]);
    },
    BUILD_TIMEOUT,
  );

  it(
    "is found by the same read when an app calls buffer",
    async () => {
      const chunks = await buildApp(
        `import { buffer } from ${JSON.stringify(CORE_ENTRY)};\nconsole.log(buffer({ type: "Point", coordinates: [0, 0] }, 10));\n`,
      );
      expect(eagerChunks(chunks).filter(holdsJsts).map(nameOf)).not.toEqual([]);
    },
    BUILD_TIMEOUT,
  );
});
