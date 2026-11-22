// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defineConfig, triggers } from "cf/config";

/**
 * The documentation site's Worker: static assets only, no Worker code. It is
 * read by `cf build` and `cf deploy`; the assets are the output of the
 * Docusaurus build (`build/`), served under the base path.
 *
 * The reference site's Worker owns the hostname as a Custom Domain, and this
 * Worker is attached to a route on the same hostname. A route Worker runs in
 * front of the Custom Domain Worker, so requests under the base path reach
 * the assets and every other request still reaches the reference site. The
 * settings follow the reference site's Worker (`packages/web/cloudflare.config.ts`)
 * wherever they apply to a Worker with no code.
 *
 * The hostname, zone and base path are written here and not imported, because
 * `cf` loads this file as a bare ES module, which resolves no extensionless
 * import. `siteConfig.test.ts` keeps them equal to `src/siteConfig.ts`.
 */
const compatibilityDate = "2026-09-08";
const hostname = "mapcairn.timothybrits.co.za";
const zone = "timothybrits.co.za";
const basePath = "/docs";

export default defineConfig({
  worker: {
    name: "mapcairn-docs",
    compatibilityDate,
    assets: {
      basePath,
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "404-page",
    },
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
    triggers: [
      triggers.fetch({ pattern: `${hostname}${basePath}`, zone }),
      triggers.fetch({ pattern: `${hostname}${basePath}/*`, zone }),
    ],
  },
});
