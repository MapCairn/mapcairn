// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundleRoot = join(
  webRoot,
  ".cloudflare/output/v0/workers/default/bundle",
);

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
  },
);
