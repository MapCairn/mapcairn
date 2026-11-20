// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defineConfig } from "vite";

// The Worker build: one file with everything bundled, resolved with the
// conditions a Worker bundler uses (the same list as WORKER_CONDITIONS in
// consumerLegs.mjs), and still no plugin.
export default defineConfig({
  ssr: {
    target: "webworker",
    noExternal: true,
    resolve: { conditions: ["workerd", "worker", "browser"] },
  },
  build: { rollupOptions: { output: { inlineDynamicImports: true } } },
});
