// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
// Builds the app five ways with Vite's own API and prints which modules each
// build holds, so the check can say whether the umbrella's root brings the
// map engine into a client, a server or a Worker bundle. Nothing is written:
// every build runs with `write: false`. The last two builds go through the
// adapter on purpose (`src/realMap.ts`), as controls that must hold the engine.
import path from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";

/**
 * Every module a build bundled, and every import it left external, with its
 * size in bytes and in gzipped bytes (what a visitor downloads).
 */
function graphOf(name, result) {
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    (entry) => entry.output,
  );
  const chunks = outputs.filter((output) => output.type === "chunk");
  return {
    name,
    bytes: chunks.reduce((sum, chunk) => sum + chunk.code.length, 0),
    gzipBytes: chunks.reduce(
      (sum, chunk) => sum + gzipSync(chunk.code).length,
      0,
    ),
    files: outputs.map((output) => output.fileName),
    ids: [
      ...new Set(
        chunks.flatMap((chunk) => [
          ...chunk.moduleIds,
          ...chunk.imports,
          ...chunk.dynamicImports,
        ]),
      ),
    ],
  };
}

const control = path.resolve("src/realMap.ts");
/** @type {{ logLevel: "error" }} */
const quiet = { logLevel: "error" };
const builds = [
  graphOf(
    "client",
    await build({ ...quiet, build: { write: false, outDir: "dist/graph" } }),
  ),
  graphOf(
    "server",
    await build({
      ...quiet,
      build: { write: false, ssr: "src/entryServer.tsx", outDir: "dist/graph" },
    }),
  ),
  graphOf(
    "worker",
    await build({
      ...quiet,
      configFile: "vite.worker.config.ts",
      build: { write: false, ssr: "src/entryWorker.tsx", outDir: "dist/graph" },
    }),
  ),
  graphOf(
    "client via the subpath",
    await build({
      ...quiet,
      build: {
        write: false,
        outDir: "dist/graph",
        // A library build keeps the entry's exports, which an app build drops
        // when nothing uses them, and the engine with them.
        lib: { entry: control, formats: ["es"], fileName: "realMap" },
        // A library build in the es format is not minified by default, and the
        // budget counts what an app ships, which is minified.
        minify: true,
      },
    }),
  ),
  graphOf(
    "worker via the subpath",
    await build({
      ...quiet,
      configFile: "vite.worker.config.ts",
      build: { write: false, ssr: control, outDir: "dist/graph" },
    }),
  ),
];
process.stdout.write(JSON.stringify(builds));
