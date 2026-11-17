// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LinksFunction, MetaDescriptor, MetaFunction } from "react-router";
import { describe, expect, it } from "vitest";
import { SITE_URL } from "../constants/siteConfig";
import { faqEntries } from "../product/productContent";
import * as mapRoute from "./map";
import * as privacyRoute from "./privacy";
import * as productRoute from "./product";

/*
 * Each page's head, side by side: a title and description of its own, a
 * canonical URL that its Open Graph URL repeats, and structured data that is
 * valid JSON and claims only the facts listed here, each checked against the
 * repository.
 */

interface RouteHead {
  readonly meta: MetaFunction;
  readonly links: LinksFunction;
}

const PAGES: ReadonlyArray<readonly [string, RouteHead, string]> = [
  ["product page", productRoute, `${SITE_URL}/`],
  ["playground", mapRoute, `${SITE_URL}/map`],
  ["privacy policy", privacyRoute, `${SITE_URL}/privacy`],
];

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/** The value of a meta tag by its name or property. */
function tag(tags: MetaDescriptor[], key: string): string | undefined {
  const found = tags.find(
    (entry) =>
      (entry as { name?: string }).name === key ||
      (entry as { property?: string }).property === key,
  ) as { content?: string } | undefined;
  return found?.content;
}

/** The page's JSON-LD, written out and read back as a crawler would. */
function graph(tags: MetaDescriptor[]): Record<string, unknown>[] {
  const scripts = tags.filter((entry) => "script:ld+json" in entry);
  expect(scripts).toHaveLength(1);
  const parsed = JSON.parse(
    JSON.stringify((scripts[0] as Record<string, unknown>)["script:ld+json"]),
  ) as { "@context": string; "@graph": Record<string, unknown>[] };
  expect(parsed["@context"]).toBe("https://schema.org");
  return parsed["@graph"];
}

/** The node of one type in a graph. */
function node(
  nodes: Record<string, unknown>[],
  type: string,
): Record<string, unknown> {
  const found = nodes.find((entry) => entry["@type"] === type);
  expect(found, type).toBeDefined();
  return found ?? {};
}

describe.each(PAGES)("the %s's head", (_name, route, url) => {
  const tags = route.meta({} as never) ?? [];

  it("has its own canonical URL, which Open Graph repeats", () => {
    expect(route.links()).toContainEqual({ rel: "canonical", href: url });
    expect(tag(tags, "og:url")).toBe(url);
  });

  it("has a title, a description, preview tags and stays indexable", () => {
    expect(tags.find((entry) => "title" in entry)).toBeDefined();
    expect(tag(tags, "description")?.length).toBeGreaterThan(50);
    expect(tag(tags, "og:image")).toMatch(
      new RegExp(`^${SITE_URL}/og-(sdk|image)\\.png$`),
    );
    expect(tag(tags, "twitter:card")).toBe("summary_large_image");
    expect(tag(tags, "robots")).toBe("index, follow");
  });

  it("names the site, with its URL", () => {
    expect(node(graph(tags), "WebSite")).toMatchObject({
      name: "MapCairn",
      url: `${SITE_URL}/`,
    });
  });
});

describe("the heads together", () => {
  it("give every page a different title and description", () => {
    const heads = PAGES.map(([, route]) => route.meta({} as never) ?? []);
    const titles = heads.map(
      (tags) =>
        (tags.find((entry) => "title" in entry) as { title: string }).title,
    );
    const descriptions = heads.map((tags) => tag(tags, "description"));
    expect(new Set(titles).size).toBe(PAGES.length);
    expect(new Set(descriptions).size).toBe(PAGES.length);
  });
});

describe("the product page's structured data", () => {
  const nodes = graph(productRoute.meta({} as never) ?? []);

  it("describes the source code with only facts the repository holds", () => {
    const code = node(nodes, "SoftwareSourceCode");
    expect(code).toMatchObject({
      name: "MapCairn",
      url: `${SITE_URL}/`,
      codeRepository: "https://github.com/MapCairn/mapcairn",
      license: "https://spdx.org/licenses/AGPL-3.0-only.html",
      programmingLanguage: "TypeScript",
      runtimePlatform: "Web browser",
    });
    expect(Object.keys(code).sort()).toEqual(
      [
        "@id",
        "@type",
        "codeRepository",
        "description",
        "isAccessibleForFree",
        "license",
        "name",
        "programmingLanguage",
        "runtimePlatform",
        "url",
      ].sort(),
    );
    // The licence the structured data names is the one in the repository.
    expect(readFileSync(path.join(REPO_ROOT, "LICENSE"), "utf8")).toContain(
      "GNU AFFERO GENERAL PUBLIC LICENSE",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "packages/core/package.json"), "utf8"),
    ) as { license: string };
    expect(manifest.license).toBe("AGPL-3.0-only");
  });

  it("lists exactly the questions the page answers, with the page's answers", () => {
    const faq = node(nodes, "FAQPage");
    const questions = (
      faq.mainEntity as {
        name: string;
        acceptedAnswer: { text: string };
      }[]
    ).map((entry) => ({
      question: entry.name,
      answer: entry.acceptedAnswer.text,
    }));
    expect(questions).toEqual(faqEntries());
  });

  it("claims no organisation, rating, offer, other profile or npm package", () => {
    const text = JSON.stringify(nodes);
    expect(text).not.toMatch(
      /Organization|AggregateRating|Review|Offer|sameAs|npm/i,
    );
  });

  it("links the page's text as Markdown", () => {
    expect(productRoute.links()).toContainEqual(
      expect.objectContaining({
        rel: "alternate",
        type: "text/markdown",
        href: "/index.md",
      }),
    );
  });
});

describe("the playground's structured data", () => {
  const nodes = graph(mapRoute.meta({} as never) ?? []);

  it("describes a free web application that needs a browser with WebGL", () => {
    expect(node(nodes, "WebApplication")).toMatchObject({
      name: "MapCairn playground",
      url: `${SITE_URL}/map`,
      applicationCategory: "MappingApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript and WebGL.",
      isAccessibleForFree: true,
      inLanguage: ["en-GB", "af"],
    });
  });

  it("has a trail back to the product page", () => {
    expect(node(nodes, "BreadcrumbList").itemListElement).toEqual([
      expect.objectContaining({ position: 1, item: `${SITE_URL}/` }),
      expect.objectContaining({ position: 2, item: `${SITE_URL}/map` }),
    ]);
  });
});

describe("the privacy policy's structured data", () => {
  it("is a web page with a trail back to the product page", () => {
    const nodes = graph(privacyRoute.meta({} as never) ?? []);
    expect(node(nodes, "WebPage")).toMatchObject({
      url: `${SITE_URL}/privacy`,
    });
    expect(node(nodes, "BreadcrumbList").itemListElement).toEqual([
      expect.objectContaining({ position: 1, item: `${SITE_URL}/` }),
      expect.objectContaining({ position: 2, item: `${SITE_URL}/privacy` }),
    ]);
  });
});
