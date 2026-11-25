// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { buildPageMeta } from "./buildPageMeta";
import { jsonLdGraph, websiteNode } from "./structuredData";

const page = {
  title: "Test title",
  description: "Test description",
  url: "https://example.com/page",
  structuredData: jsonLdGraph([websiteNode()]),
} as const;

describe("buildPageMeta", () => {
  it("derives every title, description and URL tag from the page's own values", () => {
    const tags = buildPageMeta({ ...page, image: "map" });
    expect(tags).toEqual(
      expect.arrayContaining([
        { title: "Test title" },
        { name: "description", content: "Test description" },
        { property: "og:title", content: "Test title" },
        { property: "og:description", content: "Test description" },
        { property: "og:url", content: "https://example.com/page" },
        { name: "twitter:title", content: "Test title" },
        { name: "twitter:description", content: "Test description" },
        { name: "robots", content: "index, follow" },
      ]),
    );
  });

  it("uses the preview image the page names, as an absolute URL with its size and words", () => {
    const tags = buildPageMeta({ ...page, image: "product" });
    expect(tags).toEqual(
      expect.arrayContaining([
        {
          property: "og:image",
          content: "https://mapcairn.com/og-sdk.png",
        },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        {
          name: "twitter:image",
          content: "https://mapcairn.com/og-sdk.png",
        },
        expect.objectContaining({ property: "og:image:alt" }),
        expect.objectContaining({ name: "twitter:image:alt" }),
      ]),
    );
  });

  it("carries the page's structured data as one JSON-LD document", () => {
    const tags = buildPageMeta({ ...page, image: "map" });
    const scripts = tags.filter((tag) => "script:ld+json" in tag);
    expect(scripts).toEqual([{ "script:ld+json": page.structuredData }]);
  });
});
