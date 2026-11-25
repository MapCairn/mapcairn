// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import cloudflareConfig from "../cloudflare.config";
import { BASE_URL, HOST_ORIGIN, SITE_ORIGIN } from "./siteConfig";

const HOST_SITE_CONFIG = readFileSync(
  new URL("../../../packages/web/src/constants/siteConfig.ts", import.meta.url),
  "utf8",
);

describe("siteConfig", () => {
  it("names the reference site's origin, which the documentation links to by full address", () => {
    expect(HOST_SITE_CONFIG).toContain(
      `export const SITE_URL = "${HOST_ORIGIN}";`,
    );
  });

  it("names the documentation origin the reference site links to", () => {
    expect(HOST_SITE_CONFIG).toContain(
      `export const DOCS_URL = "${SITE_ORIGIN}/";`,
    );
  });

  it("serves the site at the root of its own hostname", () => {
    expect(BASE_URL).toBe("/");
    expect(new URL(SITE_ORIGIN).pathname).toBe("/");
  });

  it("is a different origin from the reference site, so no link between them is relative", () => {
    expect(new URL(SITE_ORIGIN).origin).not.toBe(new URL(HOST_ORIGIN).origin);
  });
});

const HOST_WORKER_CONFIG = readFileSync(
  new URL("../../../packages/web/cloudflare.config.ts", import.meta.url),
  "utf8",
);

describe("the host's Worker configuration", () => {
  it("is on the same compatibility date", () => {
    const { worker } = cloudflareConfig as {
      worker: { compatibilityDate: string };
    };
    expect(HOST_WORKER_CONFIG).toContain(
      `compatibilityDate = "${worker.compatibilityDate}"`,
    );
  });
});

describe("the Worker's configuration", () => {
  const { worker } = cloudflareConfig as {
    worker: {
      assets: { basePath?: string };
      triggers?: unknown;
      domains?: string[];
      workersDev: boolean;
    };
  };

  it("serves the assets from the root, as the site is built for", () => {
    expect(worker.assets.basePath).toBeUndefined();
  });

  it("owns the site's hostname as its Custom Domain, with no route", () => {
    expect(worker.domains).toEqual([new URL(SITE_ORIGIN).hostname]);
    expect(worker.triggers).toBeUndefined();
  });

  it("stays off workers.dev, as the reference site does", () => {
    expect(worker.workersDev).toBe(false);
  });
});
