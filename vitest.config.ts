// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The example app runs its tests here but sits outside the coverage
    // include below: it proves the SDK can be embedded, and its own lines are
    // not part of the SDK whose floors the thresholds guard. Its test runs SDK
    // code during the coverage run, but is not meant to cover it. The same
    // goes for the documentation site under `sites`: its tests run here, and
    // `packages/*/src/**` keeps its code out of the coverage include.
    projects: ["packages/*", "examples/*", "sites/*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // The scripts under `scripts` decide what is published, what merges and
      // what agents may do, so they are measured too, with a floor of their own
      // below. The exclusions after the packages' own list each say why.
      include: ["packages/*/src/**", "scripts/**/*.{mjs,cjs}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        // Snapshots of rendered markup are test data, not code to cover.
        "**/*.snap.html",
        "**/vite-env.d.ts",
        // The scripted stand-in for the engine that the adapter's tests drive,
        // test code shipped as a module.
        "packages/adapter-maplibre/src/maplibreTestEngine.ts",
        "packages/web/src/entry.client.tsx",
        "packages/web/src/entry.server.tsx",
        // Generators that need a network, a browser or the engine and write
        // committed assets; a check compares their output, not their lines.
        "scripts/captureReadmePictures.mjs",
        "scripts/generateBasemapThumbnails.mjs",
        "scripts/generateContours.mjs",
        // Run by `npm run build`, which fails if they are wrong; a unit test
        // would only restate the real build.
        "scripts/buildPackage.mjs",
        "scripts/shareDeclarations.mjs",
        // Command-line wrappers with no logic of their own: the work is in
        // modules whose tests are counted.
        "scripts/depcruise.mjs",
        "scripts/agents/sync.mjs",
        "scripts/harmony/cli.mjs",
        "scripts/release/notes.mjs",
        // Drive a real browser or workerd against packed packages; the
        // `consumer:check` run in the release is their test.
        "scripts/release/browserRun.mjs",
        "scripts/release/quickstartRun.mjs",
        "scripts/release/workerdRun.mjs",
        // Source files that are built and run inside a packed consumer app.
        "scripts/release/consumer*/**",
      ],
      thresholds: {
        "packages/{core,map,react,theme,sdk,adapter-maplibre}/**": {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        // The scripts hold a lower floor than the packages. Several release
        // scripts shell out to npm, git or a browser, and their tests cover
        // the logic around those calls, not the calls. Set a little below the
        // measured figures and raised as the measure rises (#608).
        "scripts/**": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        // The host sits a little lower on branches because its layout and
        // touch-gesture code is also covered by Playwright, not only by jsdom.
        // Set below the measured figures so ordinary changes do not trip it,
        // and raised when the measure rises. The MapLibre adapter has its own
        // floor above, so these figures no longer include it.
        "packages/web/**": {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
      },
    },
  },
});
