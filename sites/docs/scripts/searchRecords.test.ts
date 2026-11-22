// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { extractRecords, pagePathToUrl } from "./searchRecords";

const PAGE = `<html><head><title>Get started | MapCairn documentation</title></head><body>
<nav>Skip to main content Sidebar noise</nav>
<article>
<header><h1>Get started</h1></header>
<p>This page installs the SDK.</p>
<h2 class="anchor" id="install">Install<a class="hash-link" href="#install" title="Direct link to Install">&#8203;</a></h2>
<pre><code>npm install @mapcairn/sdk</code></pre>
<p>Use <code>MapView</code> &amp; friends.</p>
<h3 id="peers">Peers</h3>
<p>maplibre-gl is a required peer.</p>
</article>
<footer>Footer noise</footer>
</body></html>`;

describe("pagePathToUrl", () => {
  it("maps the front page and nested pages under the base path", () => {
    expect(pagePathToUrl("index.html", "/docs/")).toBe("/docs/");
    expect(pagePathToUrl("guides/embed/index.html", "/docs/")).toBe(
      "/docs/guides/embed/",
    );
  });

  it("keeps a page that is not an index file as written", () => {
    expect(pagePathToUrl("404.html", "/docs/")).toBe("/docs/404.html");
  });
});

describe("extractRecords", () => {
  const records = extractRecords(PAGE, "/docs/");

  it("makes one record for the introduction and one for each heading", () => {
    expect(records.map((record) => record.url)).toEqual([
      "/docs/",
      "/docs/#install",
      "/docs/#peers",
    ]);
  });

  it("names the page and the heading on each record", () => {
    expect(records[0]).toMatchObject({ page: "Get started", heading: "" });
    expect(records[1]).toMatchObject({
      page: "Get started",
      heading: "Install",
    });
  });

  it("keeps body text, including code, and drops tags and entities", () => {
    expect(records[0]?.text).toBe("This page installs the SDK.");
    expect(records[1]?.text).toBe(
      "npm install @mapcairn/sdk Use MapView & friends.",
    );
  });

  it("leaves out the header, footer and sidebar text", () => {
    const all = records.map((record) => record.text).join(" ");
    expect(all).not.toContain("noise");
  });

  it("gives every record a unique id", () => {
    expect(new Set(records.map((record) => record.id)).size).toBe(3);
  });

  it("leaves out breadcrumbs, the mobile contents button and icons, and keeps one record for the introduction", () => {
    const page = `<article><nav aria-label="Breadcrumbs"><ul><li>Crumb</li></ul></nav><div><button type="button">On this page</button></div><div><header><h1>Title</h1></header><p>Body text.</p><svg><path d="M0"></path></svg></div></article>`;
    expect(extractRecords(page, "/docs/t/")).toEqual([
      {
        id: "/docs/t/",
        url: "/docs/t/",
        page: "Title",
        heading: "",
        text: "Body text.",
      },
    ]);
  });

  it("keeps ids unique when headings have no anchor", () => {
    const page =
      "<article><h1>T</h1><p>Intro.</p><h2>One</h2><p>a</p><h2>Two</h2><p>b</p></article>";
    const ids = extractRecords(page, "/docs/t/").map((record) => record.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("joins words that inline markup splits, and separates block text", () => {
    const page =
      "<article><h1>T</h1><p><strong>Map</strong>View and <code>@mapcairn</code>/sdk</p><p>Next</p></article>";
    expect(extractRecords(page, "/docs/t/")[0]?.text).toBe(
      "MapView and @mapcairn/sdk Next",
    );
  });

  it("takes the anchor from id, not data-id", () => {
    const page =
      '<article><h1>T</h1><h2 data-id="no" id="yes">H</h2><p>x</p></article>';
    expect(extractRecords(page, "/docs/t/")[0]?.url).toBe("/docs/t/#yes");
  });

  it("leaves no tag behind when tags are nested inside tags", () => {
    const page =
      "<article><h1>T</h1><p>a <scr<b>ipt>x</scr</b>ipt> b <<i>b>c</p></article>";
    expect(extractRecords(page, "/docs/t/")[0]?.text).not.toMatch(/<[a-z/]/i);
  });

  it("returns nothing for a page with no article", () => {
    expect(extractRecords("<html><body>x</body></html>", "/docs/")).toEqual([]);
  });
});
