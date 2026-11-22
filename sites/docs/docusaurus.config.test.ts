// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import config from "./docusaurus.config";
import { docsMissingFromSidebar, sidebarDocIds } from "./scripts/docChecks";
import { sidebar } from "./sidebars";
import { BASE_URL, SITE_ORIGIN } from "./src/siteConfig";

describe("docusaurus.config", () => {
  it("fails the build on a broken link, anchor or Markdown link, and on a duplicate route", () => {
    expect(config.onBrokenLinks).toBe("throw");
    expect(config.onBrokenAnchors).toBe("throw");
    expect(config.onDuplicateRoutes).toBe("throw");
    expect(config.markdown?.hooks?.onBrokenMarkdownLinks).toBe("throw");
  });

  it("is built for the base path on the reference site's origin", () => {
    expect(config.url).toBe(SITE_ORIGIN);
    expect(config.baseUrl).toBe(BASE_URL);
  });

  it("has no blog, and serves the docs from the site's root", () => {
    const [, options] = (config.presets ?? [])[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(options.blog).toBe(false);
    expect(options.pages).toBe(false);
    expect((options.docs as { routeBasePath: string }).routeBasePath).toBe("/");
  });

  it("keeps the framework's storage key un-namespaced, as the theme bridge expects", () => {
    expect(config.storage).toEqual({ type: "localStorage", namespace: false });
  });

  it("holds no third-party plugin, theme, script or client module of its own", () => {
    expect(config.plugins).toHaveLength(1);
    expect(config.themes).toBeUndefined();
    expect(config.scripts).toBeUndefined();
    expect(config.clientModules).toBeUndefined();
    expect(config.stylesheets).toBeUndefined();
  });

  it("loads no analytics, search service or other third-party plugin", () => {
    const [, options] = (config.presets ?? [])[0] as [
      string,
      Record<string, unknown>,
    ];
    for (const key of ["gtag", "googleAnalytics", "googleTagManager"]) {
      expect(options[key]).toBeUndefined();
    }
    expect(
      (config.themeConfig as Record<string, unknown>).algolia,
    ).toBeUndefined();
  });
});

describe("the sidebar", () => {
  it("lists every page in docs/", () => {
    const docsDir = new URL("./docs", import.meta.url).pathname;
    expect(docsMissingFromSidebar(docsDir, sidebarDocIds(sidebar))).toEqual([]);
  });
});
