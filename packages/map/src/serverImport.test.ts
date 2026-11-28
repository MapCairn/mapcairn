// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Importing the built package on a server. Lit's browser build extends
 * `HTMLElement` when it is loaded, and a bundler that takes the `browser`
 * condition for a server picks that build, so nothing a server evaluates may
 * load Lit. These import the built `dist` as an outside app would, so they need
 * `npm run build:sdk` first.
 */
const packageFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** How long a Vite build and a Node process may take on a busy machine. */
const BUILD_TIMEOUT_MS = 120_000;

/** What the consumer check's Worker bundle resolves with (`vite.worker.config.ts`). */
const WORKER_CONDITIONS = ["workerd", "worker", "browser"];

/** Server code that renders what a host's server would, and says it did. */
const SERVER_ENTRY = `
import { createFakeServices } from "@mapcairn/core";
import { LiveRegionProvider, SegmentedControl, ServicesProvider } from "@mapcairn/map";
import { createElement as element } from "react";
import { renderToString } from "react-dom/server.edge";

const html = renderToString(
  element(ServicesProvider, { services: createFakeServices() },
    element(LiveRegionProvider, null,
      element(SegmentedControl, {
        label: "Units",
        options: [{ value: "metric", label: "Metric" }],
        value: "metric",
        onValueChange: () => undefined,
      }))),
);
process.stdout.write(JSON.stringify({ html, element: typeof HTMLElement }));
`;

/** Runs a module in a fresh Node process, where there is no `HTMLElement`. */
function runNode(args: readonly string[]) {
  return spawnSync(process.execPath, [...args], {
    cwd: packageFolder,
    encoding: "utf8",
  });
}

describe("importing the built package on a server", () => {
  let scratch = "";

  beforeAll(() => {
    // Inside the package, so the bundler resolves its dependencies as an app would.
    scratch = mkdtempSync(path.join(packageFolder, ".tmp-server-import-"));
    writeFileSync(path.join(scratch, "entry.mjs"), SERVER_ENTRY);
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("imports in plain Node, with no bundler and no conditions", () => {
    const run = runNode([
      "--input-type=module",
      "-e",
      'await import("@mapcairn/map"); process.stdout.write(typeof HTMLElement);',
    ]);

    expect(run.stderr).toBe("");
    expect(run.stdout).toBe("undefined");
  });

  it.each([
    ["one file, with dynamic imports inlined", true],
    ["chunks, with dynamic imports kept apart", false],
  ])(
    "imports and renders in a browser-condition server bundle of %s",
    async (_name, inlined) => {
      const outDir = path.join(scratch, inlined ? "inlined" : "chunked");
      await build({
        root: scratch,
        configFile: false,
        logLevel: "silent",
        ssr: {
          target: "webworker",
          noExternal: true,
          resolve: { conditions: WORKER_CONDITIONS },
        },
        build: {
          ssr: path.join(scratch, "entry.mjs"),
          outDir,
          minify: false,
          rolldownOptions: {
            output: {
              entryFileNames: "entry.mjs",
              codeSplitting: !inlined,
            },
          },
        },
      });

      const run = runNode([path.join(outDir, "entry.mjs")]);

      expect(run.stderr).toBe("");
      const rendered = JSON.parse(run.stdout);
      expect(rendered.element).toBe("undefined");
      // The announcer's regions are in the server's markup, empty, before any
      // script runs: the product page announces into them with none of ours.
      expect(rendered.html).toMatch(
        /<div role="status"[^>]*data-testid="live-region-polite"[^>]*><\/div>/,
      );
      expect(rendered.html).toMatch(
        /<div role="alert"[^>]*data-testid="live-region-assertive"[^>]*><\/div>/,
      );
    },
    BUILD_TIMEOUT_MS,
  );
});
