// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { workerBundleRoot } from "./workerBundleRoot";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundleRoot = workerBundleRoot(webRoot) ?? "";

/**
 * A ceiling for the whole bundle directory. The bundle is about 2.5 MB without
 * the map engine and 3.9 MB with it, so this catches the engine returning
 * under a chunk name that does not say "maplibre". Raise it on purpose, with a
 * reason, when the server code grows.
 */
const MAX_BUNDLE_BYTES = 3_000_000;

/**
 * The files the Cloudflare Vite plugin wrote for the Worker. The Worker only
 * renders pages, so the map engine, which loads in the browser, belongs in the
 * static assets and nowhere in this bundle (issue #419). Skipped where there
 * is no build output (a plain `npm test` on a fresh checkout).
 */
describe.skipIf(!existsSync(bundleRoot))(
  "the Worker bundle in the build output (needs `npm run build`)",
  () => {
    it("holds no map engine, engine worker or engine stylesheet", () => {
      const files = readdirSync(bundleRoot, { recursive: true }).map(String);
      expect(files).toContain("index.js");
      expect(files.filter((path) => /maplibre/i.test(path))).toEqual([]);
    });

    it("stays under the size ceiling", () => {
      const bytes = readdirSync(bundleRoot, { recursive: true })
        .map((path) => statSync(join(bundleRoot, String(path))))
        .filter((entry) => entry.isFile())
        .reduce((total, entry) => total + entry.size, 0);
      expect(bytes).toBeLessThan(MAX_BUNDLE_BYTES);
    });
  },
);
