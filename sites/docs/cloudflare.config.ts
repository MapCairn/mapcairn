// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defineConfig } from "cf/config";

/**
 * The documentation site's Worker: static assets only, no Worker code. It is
 * read by `cf build` and `cf deploy`; the assets are the output of the
 * Docusaurus build (`build/`).
 *
 * The Worker owns `docs.mapcairn.com` as a Custom Domain and serves the
 * assets from the root of it. The reference site's Worker redirects the old
 * `/docs/...` addresses on its own hostnames here, so a link in a published
 * README keeps working. The settings follow the reference site's Worker
 * (`packages/web/cloudflare.config.ts`) wherever they apply to a Worker with
 * no code.
 *
 * The hostname is written here and not imported, because `cf` loads this file
 * as a bare ES module, which resolves no extensionless import.
 * `siteConfig.test.ts` keeps it equal to `src/siteConfig.ts`.
 */
const compatibilityDate = "2026-09-08";
const hostname = "docs.mapcairn.com";

export default defineConfig({
  worker: {
    name: "mapcairn-docs",
    compatibilityDate,
    assets: {
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
    domains: [hostname],
  },
});
