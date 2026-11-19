// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { bindings, defineConfig } from "cf/config";

/**
 * The reference host's Worker, read by `cf dev`, `cf build` and `cf deploy`
 * and by the Cloudflare Vite plugin. The static assets are the output of the
 * client build, so there is no asset directory to name here.
 *
 * Modes: no mode is production, and `e2e` is the local end-to-end server
 * (`scripts/startE2e.mjs`), which has no routes. A Preview
 * (`cf previews deploy`) takes the production settings.
 */
const entrypoint = "./workers/app.ts";
const compatibilityDate = "2026-09-08";
const compatibilityFlags = ["nodejs_compat"];
const env = { ASSETS: bindings.assets() };

export default defineConfig(({ mode }) => {
  if (mode === "e2e") {
    return {
      worker: {
        name: "mapcairn",
        compatibilityDate,
        compatibilityFlags,
        entrypoint,
        workersDev: true,
        observability: {
          enabled: true,
          headSamplingRate: 1,
          logs: { enabled: true, invocationLogs: true, headSamplingRate: 1 },
          traces: { enabled: true, headSamplingRate: 1 },
        },
        env,
      },
    };
  }
  return {
    worker: {
      name: "mapcairn",
      compatibilityDate,
      compatibilityFlags,
      entrypoint,
      workersDev: false,
      previewUrls: true,
      placement: { mode: "smart" },
      observability: {
        enabled: true,
        headSamplingRate: 1,
        redactQueryString: true,
        logs: {
          enabled: true,
          headSamplingRate: 1,
          invocationLogs: true,
          persist: true,
        },
        traces: { enabled: true, headSamplingRate: 1, persist: true },
        issues: { enabled: true },
      },
      domains: ["karta.timothybrits.co.za", "mapcairn.timothybrits.co.za"],
      env,
    },
  };
});
