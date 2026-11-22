// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import cloudflareConfig from "../cloudflare.config";
import { BASE_URL, SITE_ORIGIN, ZONE } from "./siteConfig";

const HOST_SITE_CONFIG = readFileSync(
  new URL("../../../packages/web/src/constants/siteConfig.ts", import.meta.url),
  "utf8",
);

describe("siteConfig", () => {
  it("names the same origin as the reference site", () => {
    expect(HOST_SITE_CONFIG).toContain(
      `export const SITE_URL = "${SITE_ORIGIN}";`,
    );
  });

  it("keeps the base path to one path segment with both slashes", () => {
    expect(BASE_URL).toMatch(/^\/[a-z]+\/$/);
  });

  it("puts the zone at the end of the hostname", () => {
    expect(new URL(SITE_ORIGIN).hostname.endsWith(`.${ZONE}`)).toBe(true);
  });
});

const HOST_WORKER_CONFIG = readFileSync(
  new URL("../../../packages/web/cloudflare.config.ts", import.meta.url),
  "utf8",
);

describe("the host's Worker configuration", () => {
  it("is on the same compatibility date, and serves the hostname this site's route names", () => {
    const { worker } = cloudflareConfig as {
      worker: { compatibilityDate: string };
    };
    expect(HOST_WORKER_CONFIG).toContain(
      `compatibilityDate = "${worker.compatibilityDate}"`,
    );
    expect(HOST_WORKER_CONFIG).toContain(`"${new URL(SITE_ORIGIN).hostname}"`);
  });
});

describe("the Worker's configuration", () => {
  const { worker } = cloudflareConfig as {
    worker: {
      assets: { basePath: string };
      triggers: Array<{ pattern: string; zone: string }>;
      domains?: unknown;
      workersDev: boolean;
    };
  };

  it("serves the assets under the same base path the site is built for", () => {
    expect(`${worker.assets.basePath}/`).toBe(BASE_URL);
  });

  it("takes a route on the site's hostname, for the base path and everything under it", () => {
    const hostname = new URL(SITE_ORIGIN).hostname;
    expect(worker.triggers.map(({ pattern }) => pattern).sort()).toEqual([
      `${hostname}${BASE_URL.slice(0, -1)}`,
      `${hostname}${BASE_URL}*`,
    ]);
    expect(worker.triggers.every(({ zone }) => zone === ZONE)).toBe(true);
  });

  it("claims no Custom Domain, which the reference site's Worker owns", () => {
    expect(worker.domains).toBeUndefined();
  });

  it("stays off workers.dev, as the reference site does", () => {
    expect(worker.workersDev).toBe(false);
  });
});
