// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { SITE_URL } from "../constants/siteConfig";
import { routePaths } from "../routePaths";
import routes from "../routes";
import { loader } from "./sitemap.xml";

describe("/sitemap.xml route", () => {
  it("lists the product page, the playground and the privacy policy as absolute URLs", async () => {
    const response = loader();
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8",
    );
    const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    );
    expect(locations).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/map`,
      `${SITE_URL}/privacy`,
    ]);
  });

  it("lists only pages the route table has, and no date it cannot know", async () => {
    const body = await loader().text();
    const paths = new Set(routePaths(routes));
    for (const [, path] of body.matchAll(/<loc>[^<]+?\/([^/<]*)<\/loc>/g)) {
      expect(paths.has(path ?? "")).toBe(true);
    }
    expect(body).not.toContain("<lastmod>");
  });
});
