// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_URL } from "../constants/siteConfig";
import { PLAYGROUND_TOOLS } from "../product/llmsText";
import { productMarkdown } from "../product/productMarkdown";
import routes from "../routes";
import { loader } from "./llms.txt";
import { loader as fullLoader } from "./llms-full.txt";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const RAW_PREFIX = "https://raw.githubusercontent.com/MapCairn/mapcairn/main/";
const BLOB_PREFIX = "https://github.com/MapCairn/mapcairn/blob/main/";

/** Every Markdown link target in a text. */
function linkTargets(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? "");
}

/** The route paths the site serves, `""` for the index. */
const ROUTE_PATHS = new Set(
  routes.map((entry) => (entry.index ? "" : (entry.path ?? ""))),
);

/** Checks a link points at a page the site serves or a file the repository has. */
function expectResolves(target: string): void {
  if (target.startsWith(`${SITE_URL}/`)) {
    const page = target.slice(SITE_URL.length + 1).split("#")[0] ?? "";
    expect(ROUTE_PATHS.has(page), target).toBe(true);
    return;
  }
  for (const prefix of [RAW_PREFIX, BLOB_PREFIX]) {
    if (target.startsWith(prefix)) {
      const file = target.slice(prefix.length).split("#")[0] ?? "";
      expect(existsSync(path.join(REPO_ROOT, file)), target).toBe(true);
      return;
    }
  }
  expect(target, "a link outside the site and the repository").toMatch(
    /^https:\/\/github\.com\/MapCairn\/mapcairn(\/(issues(\/\d+)?|tree\/main\/[\w/.-]+))?$/,
  );
}

describe("/llms.txt", () => {
  it("is plain text in the llmstxt.org layout: an h1, a one-sentence summary, then sections of links", async () => {
    const response = loader();
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    const lines = text.split("\n");
    expect(lines[0]).toBe("# MapCairn");
    expect(lines[2]).toMatch(/^> MapCairn is an open-source SDK.*\.$/);
    // One sentence: no full stop inside it is followed by a space.
    expect(lines[2]).not.toMatch(/\. /);
    expect([...text.matchAll(/^## (.+)$/gm)].map((match) => match[1])).toEqual([
      "Product",
      "Playground",
      "Docs",
      "Policies and source",
      "Optional",
    ]);
  });

  it("puts the product first and the playground second", async () => {
    const text = await loader().text();
    expect(text.indexOf(`(${SITE_URL}/)`)).toBeLessThan(
      text.indexOf(`(${SITE_URL}/map)`),
    );
  });

  it("says what MapCairn is not, and that the packages are not on npm yet", async () => {
    const text = await loader().text();
    expect(text).toContain(
      "It is not a hosted service, a dataset or a GIS analysis engine",
    );
    expect(text).toContain("not published to npm yet");
  });

  it("links only to pages the site serves and files the repository has", async () => {
    const text = await loader().text();
    const targets = linkTargets(text);
    expect(targets.length).toBeGreaterThan(10);
    for (const target of targets) {
      expectResolves(target);
    }
  });

  it("names exactly the WebMCP tools the playground registers", async () => {
    const source = readFileSync(
      path.join(__dirname, "../webmcp/useMapModelContextTools.ts"),
      "utf8",
    );
    const registered = [...source.matchAll(/^\s+name: "([a-z-]+)",$/gm)].map(
      (match) => match[1],
    );
    expect(PLAYGROUND_TOOLS).toEqual(registered);
    const text = await loader().text();
    for (const tool of registered) {
      expect(text).toContain(`\`${tool}\``);
    }
  });
});

describe("/llms-full.txt", () => {
  it("is /llms.txt followed by the product page's whole text", async () => {
    const response = fullLoader();
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    const summary = await loader().text();
    expect(text.startsWith(summary)).toBe(true);
    expect(text.endsWith(productMarkdown())).toBe(true);
  });

  it("links only to pages the site serves and files the repository has", async () => {
    for (const target of linkTargets(await fullLoader().text())) {
      expectResolves(target);
    }
  });
});
