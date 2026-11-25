// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { DOCS_URL, SITE_URL } from "../constants/siteConfig";
import { loader } from "./robots.txt";

describe("/robots.txt route", () => {
  it("allows all crawlers and points at the generated sitemap", async () => {
    const response = loader();
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it("also names the documentation site's sitemap, because a crawler reads only this file", async () => {
    const body = await loader().text();

    expect(body).toContain(`Sitemap: ${DOCS_URL}sitemap.xml`);
  });

  it("welcomes search and AI crawlers in a comment and blocks nothing", async () => {
    const body = await loader().text();

    expect(body).toMatch(/^# .*open source/m);
    expect(body).toMatch(/^# .*AI crawlers are welcome/m);
    expect(body).not.toMatch(/^Disallow:/m);
  });
});
